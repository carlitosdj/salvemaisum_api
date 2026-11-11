import { Controller, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { SkipAuth } from '../auth/auth.decorators';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';

// Ações patrocinadas (Junho Vermelho, mutirão com hemocentro...): filhos da página 19 na tabela component.
// Campos: inicio e fim (AAAA-MM-DD), meta, cidade, hemocentro, patrocinadores (ids de parceiros da página 18, separados por vírgula), capa.
const PAGINA_ACOES = 19;
const PAGINA_PARCEIROS = 18;
const FUSO = '-03:00';

interface Linha { id: number; nome: string; descricao: string | null; chave: string | null; valor: string | null }
type Situacao = 'ativa' | 'futura' | 'encerrada';

const hojeBrasil = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const dataValida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const inteiro = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

@Injectable()
class AcaoService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  private async linhas<T>(consulta: ReturnType<typeof sql>) {
    return ((await this.db.execute(consulta)) as unknown as [T[]])[0];
  }

  private async montar(filtro: ReturnType<typeof sql>) {
    const linhas = await this.linhas<Linha>(sql`
      SELECT c.id, c.name AS nome, c.description AS descricao, e.key_extra AS chave, e.value_extra AS valor
      FROM component c LEFT JOIN component_extra e ON e.component_id = c.id
      WHERE c.component_id = ${PAGINA_ACOES} ${filtro}
      ORDER BY c.id`);
    const porId = new Map<number, { id: number; nome: string; descricao: string | null; campos: Record<string, string> }>();
    for (const l of linhas) {
      const a = porId.get(l.id) ?? { id: l.id, nome: l.nome, descricao: l.descricao, campos: {} };
      if (l.chave && l.valor !== null) a.campos[l.chave] = l.valor;
      porId.set(l.id, a);
    }
    const hoje = hojeBrasil();
    const acoes = [];
    for (const a of porId.values()) {
      const inicio = dataValida(a.campos.inicio);
      const fim = dataValida(a.campos.fim);
      if (!inicio || !fim) continue; // ação sem período ainda não aparece no site
      const situacao: Situacao = hoje < inicio ? 'futura' : hoje > fim ? 'encerrada' : 'ativa';
      const cidade = inteiro(a.campos.cidade);
      const hemocentro = inteiro(a.campos.hemocentro);
      const patrocinadores = (a.campos.patrocinadores ?? '').split(',').map((s) => inteiro(s.trim())).filter((n): n is number => !!n);
      acoes.push({
        id: a.id,
        nome: a.nome,
        descricao: a.descricao,
        inicio,
        fim,
        situacao,
        meta: inteiro(a.campos.meta),
        capa: a.campos.capa ?? null,
        fonte: a.campos.fonte_url ? { url: a.campos.fonte_url, nome: a.campos.fonte_nome ?? null } : null,
        local: await this.local(cidade, hemocentro),
        patrocinadores: await this.patrocinadores(patrocinadores),
        doacoes: situacao === 'futura' ? 0 : await this.doacoes(inicio, fim, cidade, hemocentro),
      });
    }
    const ordem: Record<Situacao, number> = { ativa: 0, futura: 1, encerrada: 2 };
    return acoes.sort((x, y) => ordem[x.situacao] - ordem[y.situacao] || (x.situacao === 'encerrada' ? y.fim.localeCompare(x.fim) : x.inicio.localeCompare(y.inicio)));
  }

  private async local(cidade: number | null, hemocentro: number | null) {
    if (hemocentro) {
      const [h] = await this.linhas<{ id: number; nome: string; cidade: string | null; uf: string | null }>(sql`
        SELECT b.id, b.name AS nome, ci.name AS cidade, st.state AS uf FROM bloodcenter b
        LEFT JOIN city ci ON ci.id = b.bccity LEFT JOIN state st ON st.id = b.bcstate WHERE b.id = ${hemocentro}`);
      if (h) return { tipo: 'hemocentro' as const, ...h };
    }
    if (cidade) {
      const [c] = await this.linhas<{ id: number; cidade: string; uf: string | null }>(sql`
        SELECT ci.id, ci.name AS cidade, st.state AS uf FROM city ci LEFT JOIN state st ON st.id = ci.state WHERE ci.id = ${cidade}`);
      if (c) return { tipo: 'cidade' as const, ...c };
    }
    return { tipo: 'brasil' as const };
  }

  private async patrocinadores(ids: number[]) {
    if (!ids.length) return [];
    const linhas = await this.linhas<{ id: number; nome: string; logo: string | null; site: string | null }>(sql`
      SELECT c.id, c.name AS nome,
        MAX(CASE WHEN e.key_extra = 'logo' THEN e.value_extra END) AS logo,
        MAX(CASE WHEN e.key_extra = 'site' THEN e.value_extra END) AS site
      FROM component c LEFT JOIN component_extra e ON e.component_id = c.id
      WHERE c.component_id = ${PAGINA_PARCEIROS} AND c.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      GROUP BY c.id, c.name`);
    return ids.map((i) => linhas.find((l) => l.id === i)).filter(Boolean);
  }

  // Doações registradas no período. Sem hemocentro informado, vale a cidade do perfil de quem doou.
  private async doacoes(inicio: string, fim: string, cidade: number | null, hemocentro: number | null) {
    const de = Math.floor(Date.parse(`${inicio}T00:00:00${FUSO}`) / 1000);
    const ate = Math.floor(Date.parse(`${fim}T23:59:59${FUSO}`) / 1000);
    const lugar = hemocentro
      ? sql`AND r.bloodcenter_id = ${hemocentro}`
      : cidade ? sql`AND COALESCE(b.bccity, p.city) = ${cidade}` : sql``;
    const [r] = await this.linhas<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM registro_doacao r
      JOIN user u ON u.id = r.user_id LEFT JOIN profile p ON p.user_id = u.profileUserId
      LEFT JOIN bloodcenter b ON b.id = r.bloodcenter_id
      WHERE r.situacao <> 'recusado' AND r.data BETWEEN ${de} AND ${ate} ${lugar}`);
    return Number(r?.n ?? 0);
  }

  listar() { return this.montar(sql``); }

  async uma(id: number) {
    const [a] = await this.montar(sql`AND c.id = ${id}`);
    if (!a) throw new NotFoundException('Ação não encontrada.');
    return a;
  }
}

@ApiTags('ações patrocinadas')
@Controller('acoes')
class AcaoController {
  constructor(private readonly acoes: AcaoService) {}
  @SkipAuth() @Get() listar() { return this.acoes.listar(); }
  @SkipAuth() @Get(':id') uma(@Param('id', ParseIntPipe) id: number) { return this.acoes.uma(id); }
}

@Module({ controllers: [AcaoController], providers: [AcaoService] })
export class AcaoModule {}
