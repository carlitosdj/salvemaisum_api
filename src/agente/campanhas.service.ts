import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { agora } from '../common/agora';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import type { CampanhaAchada } from './buscador-campanhas';
import type { Consumo } from './precos';

const s = schema.campanhaSugestao;
const PAGINA_ACOES = 19;

// Brasil todo: uma busca por região, para não ficar só no Sudeste
export const REGIOES = [
  'Região Norte (AC, AP, AM, PA, RO, RR, TO)',
  'Região Nordeste (AL, BA, CE, MA, PB, PE, PI, RN, SE)',
  'Região Centro-Oeste (DF, GO, MT, MS)',
  'Região Sudeste (ES, MG, RJ, SP)',
  'Região Sul (PR, RS, SC)',
];

const normal = (v: string | null | undefined) => (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const corta = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max);
const data = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'hemocentro', 'banco', 'sangue', 'regional', 'hospital', 'centro']);

@Injectable()
export class CampanhasService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  async jaEncontradas() {
    const r = await this.db.select({ titulo: s.titulo }).from(s).orderBy(desc(s.id)).limit(80);
    return r.map((x) => x.titulo);
  }

  // Liga o local citado ao cadastro do site: cidade pelo nome dentro do estado; hemocentro pela cidade e pelas palavras do nome
  private async localizar(nomeHemocentro: string, cidade: string, uf: string) {
    const sigla = uf.toUpperCase().slice(0, 2);
    if (!sigla) return { bloodcenter_id: null as number | null, city_id: null as number | null };
    const cidades = (await this.db.execute(sql`SELECT ci.id, ci.name FROM city ci JOIN state st ON st.id = ci.state WHERE st.state = ${sigla}`) as unknown as [{ id: number; name: string }[]])[0];
    const city = cidades.find((c) => normal(c.name) === normal(cidade)) ?? null;
    const centros = (await this.db.execute(sql`
      SELECT b.id, b.name, b.bccity FROM bloodcenter b JOIN state st ON st.id = b.bcstate WHERE st.state = ${sigla}`) as unknown as [{ id: number; name: string; bccity: number | null }[]])[0];
    const palavras = new Set(normal(nomeHemocentro).split(' ').filter((p) => p.length > 2 && !PALAVRAS_VAZIAS.has(p)));
    let melhor: { id: number; nota: number } | null = null;
    for (const c of centros) {
      const doNome = normal(c.name).split(' ').filter((p) => palavras.has(p)).length;
      const nota = doNome + (city && c.bccity === city.id ? 2 : 0);
      if (nota > (melhor?.nota ?? 0)) melhor = { id: c.id, nota };
    }
    // Só a cidade não basta quando há vários hemocentros nela
    const naCidade = city ? centros.filter((c) => c.bccity === city.id) : [];
    const id = melhor && (melhor.nota >= 3 || (melhor.nota >= 2 && naCidade.length === 1)) ? melhor.id : null;
    return { bloodcenter_id: id, city_id: city?.id ?? null };
  }

  // Grava o que o buscador achou. Devolve quantas entraram e os motivos dos descartes.
  async guardar(achadas: CampanhaAchada[], execucaoId: number, consumo: Consumo, hoje: string) {
    const novas: string[] = [];
    const descartes: string[] = [];
    const validas = achadas.filter((a) => {
      if (!/^https?:\/\//.test(a.fonte_url)) { descartes.push(`${a.titulo}: sem link de fonte.`); return false; }
      const fim = data(a.fim);
      if (a.tipo === 'hemocentro' && fim && fim < hoje) { descartes.push(`${a.titulo}: já terminou (${fim}).`); return false; }
      if (a.tipo === 'familia') {
        const publicada = data(a.fonte_data);
        const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) - 10 * 86400000).toISOString().slice(0, 10);
        if (!publicada || publicada < limite) { descartes.push(`${a.titulo}: pedido de família sem data ou com mais de 10 dias.`); return false; }
      }
      return true;
    });
    // O custo da busca é dividido igualmente entre as campanhas que entraram
    const parte = (v: number) => (validas.length ? v / validas.length : 0);
    for (const a of validas) {
      const [repetida] = await this.db.select({ id: s.id }).from(s).where(eq(s.fonte_url, corta(a.fonte_url, 500))).limit(1);
      if (repetida) { descartes.push(`${a.titulo}: já estava na lista.`); continue; }
      const local = await this.localizar(a.hemocentro_nome, a.cidade, a.uf);
      const t = agora();
      await this.db.insert(s).values({
        execucao_id: execucaoId, tipo: a.tipo === 'familia' ? 'familia' : 'hemocentro', situacao: 'nova',
        titulo: corta(a.titulo, 200) || 'Campanha sem título', descricao: a.descricao || null,
        hemocentro_nome: corta(a.hemocentro_nome, 255) || null, bloodcenter_id: local.bloodcenter_id,
        cidade_nome: corta(a.cidade, 120) || null, uf: corta(a.uf, 2).toUpperCase() || null, city_id: local.city_id,
        inicio: data(a.inicio) || null, fim: data(a.fim) || null, tipos_sanguineos: corta(a.tipos_sanguineos, 60) || null,
        paciente_nome: a.tipo === 'familia' ? corta(a.paciente_nome, 120) || null : null, contato: a.tipo === 'familia' ? a.contato || null : null,
        fonte_nome: corta(a.fonte_nome, 160) || null, fonte_url: corta(a.fonte_url, 500), fonte_data: data(a.fonte_data) || null,
        pontos_conferir: [...(a.pontos_conferir ?? []), ...(local.bloodcenter_id ? [] : ['O local não foi encontrado no cadastro de hemocentros. Escolha ao aprovar.'])].join('\n') || null,
        tokens_entrada: Math.round(parte(consumo.tokens_entrada + consumo.cache_leitura + consumo.cache_escrita)), tokens_saida: Math.round(parte(consumo.tokens_saida)),
        buscas: Math.round(parte(consumo.buscas)), custo_usd: Number(parte(consumo.custo_usd).toFixed(4)), created_at: t, updated_at: t,
      });
      novas.push(`${a.tipo === 'familia' ? 'Família' : 'Hemocentro'}: ${a.titulo}`);
    }
    return { novas, descartes };
  }

  // ---------- adm ----------

  async listar(tipo: string, situacao: string) {
    const itens = await this.db.query.campanhaSugestao.findMany({
      where: and(eq(s.tipo, tipo === 'familia' ? 'familia' : 'hemocentro'), situacao ? eq(s.situacao, situacao) : undefined),
      orderBy: desc(s.id),
      limit: 200,
    });
    const contagem = (await this.db.select({ tipo: s.tipo, situacao: s.situacao, n: sql<number>`COUNT(*)` }).from(s).groupBy(s.tipo, s.situacao))
      .map((c) => ({ ...c, n: Number(c.n) }));
    return { itens, contagem };
  }

  private async uma(id: number) {
    const [x] = await this.db.select().from(s).where(eq(s.id, id));
    if (!x) throw new NotFoundException('Campanha não encontrada.');
    return x;
  }

  // Campanha de hemocentro aprovada vira uma Ação (página 19), com o período e o local conferidos pelo admin
  async aprovar(id: number, d: { titulo: string; descricao?: string; inicio: string; fim: string; bloodcenter_id?: number; city_id?: number }, admin: number) {
    const x = await this.uma(id);
    if (x.tipo !== 'hemocentro') throw new BadRequestException('Pedidos de família não são publicados. Marque como contatado ou autorizado.');
    if (x.acao_id) throw new BadRequestException('Esta campanha já foi aprovada.');
    if (!data(d.inicio) || !data(d.fim) || d.fim < d.inicio) throw new BadRequestException('Informe início e fim válidos.');
    const t = agora();
    const [acao] = await this.db.insert(schema.component).values({ name: corta(d.titulo, 255), description: d.descricao?.trim() || null, component_id: PAGINA_ACOES, status: 1, order: 0, created_at: t }).$returningId();
    let estado: string | null = null;
    if (!d.bloodcenter_id && d.city_id) {
      const [c] = await this.db.select({ state: schema.city.state }).from(schema.city).where(eq(schema.city.id, d.city_id));
      estado = c?.state ? String(c.state) : null;
    }
    const extras: Record<string, string | null> = {
      inicio: d.inicio, fim: d.fim, hemocentro: d.bloodcenter_id ? String(d.bloodcenter_id) : null,
      cidade: !d.bloodcenter_id && d.city_id ? String(d.city_id) : null, estado,
      fonte_url: x.fonte_url, fonte_nome: x.fonte_nome, origem: 'agente',
    };
    for (const [k, v] of Object.entries(extras)) {
      if (v) await this.db.insert(schema.componentExtra).values({ component_id: acao.id, key_extra: k, value_extra: v, status: 1, created_at: t });
    }
    await this.db.update(s).set({ situacao: 'aprovada', acao_id: acao.id, decidido_por: admin, decidido_em: t, updated_at: t }).where(eq(s.id, id));
    return this.uma(id);
  }

  async mudar(id: number, d: { situacao: string; observacao?: string; campaign_id?: number }, admin: number) {
    const x = await this.uma(id);
    const permitidas = x.tipo === 'familia' ? ['nova', 'contatada', 'autorizada', 'descartada'] : ['nova', 'descartada'];
    if (!permitidas.includes(d.situacao)) throw new BadRequestException('Situação inválida para este tipo de campanha.');
    const t = agora();
    await this.db.update(s).set({
      situacao: d.situacao, observacao: d.observacao?.trim() || x.observacao, campaign_id: d.campaign_id ?? x.campaign_id,
      decidido_por: admin, decidido_em: t, updated_at: t,
    }).where(eq(s.id, id));
    return this.uma(id);
  }
}
