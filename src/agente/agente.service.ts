import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { agora } from '../common/agora';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import { NoticiaService } from '../noticia/noticia.module';
import * as schema from '../_schemas/schema';
import { gerarCapas } from './capas';
import { EDITORIAS } from './editorias';
import { Consumo, consumoZero, somar } from './precos';
import { Chamada, escrever, revisar, totalDe } from './redator';
import { buscarCampanhas } from './buscador-campanhas';
import { CampanhasService, REGIOES } from './campanhas.service';

const x = schema.agenteExecucao;
const n = schema.noticia;
const t = schema.noticiaTema;

export interface Evento {
  em: number;
  tipo: 'info' | 'chamada' | 'noticia' | 'descarte' | 'erro';
  texto: string;
  consumo?: Consumo;
  ms?: number;
  noticia_id?: number;
}

export interface Config { limite_execucao_usd: number; limite_mes_usd: number; cotacao_dolar: number; tamanho_fila: number }
const CONFIG_PADRAO: Config = { limite_execucao_usd: 3, limite_mes_usd: 30, cotacao_dolar: 5.5, tamanho_fila: 10 };

// Início do mês no horário de Brasília, em segundos
function inicioDoMes() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 3) / 1000);
}

const corta = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max);

@Injectable()
export class AgenteService {
  private readonly log = new Logger('Agente');

  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly noticias: NoticiaService,
    private readonly campanhas: CampanhasService,
  ) {}

  // ---------- configuração (component tags = 'agente-config') ----------

  private async idConfig() {
    const [c] = await this.db.select({ id: schema.component.id }).from(schema.component).where(eq(schema.component.tags, 'agente-config')).limit(1);
    return c?.id ?? null;
  }

  async config(): Promise<Config> {
    const id = await this.idConfig();
    if (!id) return CONFIG_PADRAO;
    const extras = await this.db.select().from(schema.componentExtra).where(eq(schema.componentExtra.component_id, id));
    const valor = (k: keyof Config) => {
      const v = Number(extras.find((e) => e.key_extra === k)?.value_extra);
      return Number.isFinite(v) && v > 0 ? v : CONFIG_PADRAO[k];
    };
    return { limite_execucao_usd: valor('limite_execucao_usd'), limite_mes_usd: valor('limite_mes_usd'), cotacao_dolar: valor('cotacao_dolar'), tamanho_fila: Math.min(30, Math.round(valor('tamanho_fila'))) };
  }

  async salvarConfig(dados: Partial<Config>) {
    const id = await this.idConfig();
    if (!id) throw new NotFoundException('Configuração do agente não encontrada.');
    for (const [k, v] of Object.entries(dados)) {
      if (!(k in CONFIG_PADRAO) || !Number.isFinite(Number(v)) || Number(v) <= 0) continue;
      const onde = and(eq(schema.componentExtra.component_id, id), eq(schema.componentExtra.key_extra, k));
      const [e] = await this.db.select({ id: schema.componentExtra.id }).from(schema.componentExtra).where(onde).limit(1);
      if (e) await this.db.update(schema.componentExtra).set({ value_extra: String(v) }).where(eq(schema.componentExtra.id, e.id));
      else await this.db.insert(schema.componentExtra).values({ component_id: id, key_extra: k, value_extra: String(v), status: 1, created_at: agora() });
    }
    return this.config();
  }

  async gastoDoMes() {
    const [r] = await this.db.select({ total: sql<string>`COALESCE(SUM(${x.custo_usd}), 0)` }).from(x).where(gte(x.iniciou_em, inicioDoMes()));
    return Number(r?.total ?? 0);
  }

  private async rascunhosNaFila() {
    const [r] = await this.db.select({ n: sql<number>`COUNT(*)` }).from(n).where(eq(n.situacao, 'rascunho'));
    return Number(r?.n ?? 0);
  }

  // ---------- adm ----------

  async status() {
    const [config, gasto_mes, fila, execucoes, [totais]] = await Promise.all([
      this.config(),
      this.gastoDoMes(),
      this.rascunhosNaFila(),
      this.db.select({
        id: x.id, situacao: x.situacao, pedido: x.pedido, pauta: x.pauta, quantidade: x.quantidade, etapa: x.etapa,
        iniciou_em: x.iniciou_em, terminou_em: x.terminou_em, rascunhos: x.rascunhos, encontradas: x.encontradas,
        tokens_entrada: x.tokens_entrada, tokens_saida: x.tokens_saida, tokens_cache_leitura: x.tokens_cache_leitura,
        buscas: x.buscas, custo_usd: x.custo_usd, erro: x.erro,
      }).from(x).orderBy(desc(x.id)).limit(30),
      this.db.select({
        execucoes: sql<number>`COUNT(*)`, custo: sql<string>`COALESCE(SUM(${x.custo_usd}), 0)`,
        entrada: sql<string>`COALESCE(SUM(${x.tokens_entrada} + ${x.tokens_cache_leitura} + ${x.tokens_cache_escrita}), 0)`,
        saida: sql<string>`COALESCE(SUM(${x.tokens_saida}), 0)`, buscas: sql<string>`COALESCE(SUM(${x.buscas}), 0)`,
        rascunhos: sql<string>`COALESCE(SUM(${x.rascunhos}), 0)`,
      }).from(x),
    ]);
    const ativa = execucoes.find((e) => e.situacao === 'pedida' || e.situacao === 'rodando' || e.situacao === 'parando') ?? null;
    return {
      config, gasto_mes, fila, ativa, execucoes,
      chave_configurada: !!process.env.ANTHROPIC_API_KEY,
      total_geral: { execucoes: Number(totais.execucoes), custo_usd: Number(totais.custo), tokens_entrada: Number(totais.entrada), tokens_saida: Number(totais.saida), buscas: Number(totais.buscas), rascunhos: Number(totais.rascunhos) },
    };
  }

  async execucao(id: number) {
    const [e] = await this.db.select().from(x).where(eq(x.id, id));
    if (!e) throw new NotFoundException('Execução não encontrada.');
    const noticias = await this.db.select({ id: n.id, titulo: n.titulo, situacao: n.situacao, categoria: n.categoria, tokens_entrada: n.tokens_entrada, tokens_saida: n.tokens_saida, buscas: n.buscas, custo_usd: n.custo_usd })
      .from(n).where(eq(n.execucao_id, id)).orderBy(asc(n.id));
    const campanhas = await this.db.select({ id: schema.campanhaSugestao.id, titulo: schema.campanhaSugestao.titulo, tipo: schema.campanhaSugestao.tipo, situacao: schema.campanhaSugestao.situacao, tokens_entrada: schema.campanhaSugestao.tokens_entrada, tokens_saida: schema.campanhaSugestao.tokens_saida, buscas: schema.campanhaSugestao.buscas, custo_usd: schema.campanhaSugestao.custo_usd })
      .from(schema.campanhaSugestao).where(eq(schema.campanhaSugestao.execucao_id, id)).orderBy(asc(schema.campanhaSugestao.id));
    return { ...e, linha_do_tempo: JSON.parse(e.linha_do_tempo || '[]') as Evento[], noticias, campanhas };
  }

  async pedir(dados: { pedido: 'fila' | 'pauta' | 'campanhas'; pauta?: string; pauta_tipo?: string; quantidade?: number }, admin: number) {
    if (!process.env.ANTHROPIC_API_KEY) throw new BadRequestException('A chave da API do Claude (ANTHROPIC_API_KEY) não está configurada no servidor.');
    const [ativa] = await this.db.select({ id: x.id }).from(x).where(inArray(x.situacao, ['pedida', 'rodando', 'parando'])).limit(1);
    if (ativa) throw new BadRequestException('Já existe uma geração em andamento. Espere terminar ou pare a atual.');
    const config = await this.config();
    if ((await this.gastoDoMes()) >= config.limite_mes_usd) throw new BadRequestException(`O limite de gasto do mês (US$ ${config.limite_mes_usd.toFixed(2)}) foi atingido. Aumente o limite para gerar mais.`);
    let quantidade = 0;
    if (dados.pedido === 'campanhas') {
      const regiao = dados.pauta?.trim();
      const escopo = ['hemocentros', 'familias', 'ambos'].includes(dados.pauta_tipo ?? '') ? dados.pauta_tipo! : 'hemocentros';
      const [nova] = await this.db.insert(x).values({
        iniciou_em: agora(), situacao: 'pedida', pedido: 'campanhas', pauta: regiao ? corta(regiao, 500) : null, pauta_tipo: escopo,
        quantidade: regiao ? 1 : REGIOES.length, etapa: 'Na fila: o worker começa em instantes', linha_do_tempo: '[]', pedido_por: admin,
      }).$returningId();
      return this.execucao(nova.id);
    }
    if (dados.pedido === 'pauta') {
      if (!dados.pauta?.trim()) throw new BadRequestException('Escreva o assunto da pauta.');
      quantidade = Math.min(5, Math.max(1, Math.round(dados.quantidade ?? 1)));
    } else {
      quantidade = config.tamanho_fila - (await this.rascunhosNaFila());
      if (quantidade <= 0) throw new BadRequestException(`A fila já tem ${config.tamanho_fila} rascunhos esperando aprovação.`);
    }
    const [nova] = await this.db.insert(x).values({
      iniciou_em: agora(), situacao: 'pedida', pedido: dados.pedido, pauta: dados.pedido === 'pauta' ? corta(dados.pauta, 500) : null,
      pauta_tipo: dados.pedido === 'pauta' ? (dados.pauta_tipo === 'guia' ? 'guia' : dados.pauta_tipo === 'noticia' ? 'noticia' : 'qualquer') : null,
      quantidade, etapa: 'Na fila: o worker começa em instantes', linha_do_tempo: '[]', pedido_por: admin,
    }).$returningId();
    return this.execucao(nova.id);
  }

  async parar(id: number) {
    await this.db.update(x).set({ situacao: 'parando', etapa: 'Parando depois da notícia atual' }).where(and(eq(x.id, id), inArray(x.situacao, ['pedida', 'rodando'])));
    return this.execucao(id);
  }

  listarTemas() {
    return this.db.select().from(t).orderBy(asc(t.categoria), asc(t.nome));
  }

  async salvarTema(id: number | null, d: { nome: string; categoria: string; instrucao?: string; ativo?: boolean }) {
    if (!d.nome?.trim() || !(d.categoria in EDITORIAS)) throw new BadRequestException('Informe o nome e uma editoria válida.');
    const valores = { nome: corta(d.nome, 120), categoria: d.categoria, instrucao: corta(d.instrucao, 1000) || null, ativo: d.ativo === false ? 0 : 1 };
    if (id) await this.db.update(t).set(valores).where(eq(t.id, id));
    else await this.db.insert(t).values({ ...valores, created_at: agora() });
    return this.listarTemas();
  }

  async removerTema(id: number) {
    await this.db.delete(t).where(eq(t.id, id));
    return this.listarTemas();
  }

  // ---------- worker ----------

  // Execuções que estavam rodando quando o worker parou não vão terminar sozinhas
  async limparInterrompidas() {
    await this.db.update(x).set({ situacao: 'erro', erro: 'O worker reiniciou durante a geração.', terminou_em: agora() }).where(inArray(x.situacao, ['rodando', 'parando']));
  }

  // Pega a próxima execução pedida; o UPDATE condicional garante que só um worker fica com ela
  async proxima() {
    const [e] = await this.db.select({ id: x.id }).from(x).where(eq(x.situacao, 'pedida')).orderBy(asc(x.id)).limit(1);
    if (!e) return null;
    const [r] = (await this.db.update(x).set({ situacao: 'rodando', iniciou_em: agora() }).where(and(eq(x.id, e.id), eq(x.situacao, 'pedida')))) as unknown as [{ affectedRows: number }];
    return r.affectedRows ? e.id : null;
  }

  async processar(id: number) {
    const [exec] = await this.db.select().from(x).where(eq(x.id, id));
    const linha: Evento[] = [];
    let total = consumoZero();
    let rascunhos = 0;
    let encontradas = 0;

    const salvar = async (extra: Partial<typeof x.$inferInsert> = {}) => {
      await this.db.update(x).set({
        linha_do_tempo: JSON.stringify(linha), tokens_entrada: total.tokens_entrada, tokens_saida: total.tokens_saida,
        tokens_cache_leitura: total.cache_leitura, tokens_cache_escrita: total.cache_escrita, buscas: total.buscas,
        custo_usd: Number(total.custo_usd.toFixed(4)), rascunhos, encontradas, ...extra,
      }).where(eq(x.id, id));
    };
    const evento = async (e: Omit<Evento, 'em'>, etapa?: string) => {
      linha.push({ em: agora(), ...e });
      await salvar(etapa ? { etapa: etapa.slice(0, 255) } : {});
    };
    const registrarChamadas = async (chamadas: Chamada[]) => {
      for (const c of chamadas) {
        total = somar(total, c.consumo);
        await evento({ tipo: 'chamada', texto: c.etapa, consumo: c.consumo, ms: c.ms });
      }
    };
    const pediuParar = async () => {
      const [s] = await this.db.select({ situacao: x.situacao }).from(x).where(eq(x.id, id));
      return s?.situacao === 'parando';
    };

    try {
      const config = await this.config();
      const gastoAntes = (await this.gastoDoMes()) - Number(exec.custo_usd ?? 0);
      const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

      // Busca de campanhas: uma rodada por região, com os mesmos limites de gasto
      if (exec.pedido === 'campanhas') {
        const regioes = exec.pauta ? [exec.pauta] : REGIOES;
        const escopo = (exec.pauta_tipo as 'hemocentros' | 'familias' | 'ambos') ?? 'hemocentros';
        const nomeEscopo = { hemocentros: 'campanhas de hemocentros', familias: 'pedidos de famílias', ambos: 'campanhas de hemocentros e pedidos de famílias' }[escopo];
        await evento({ tipo: 'info', texto: `Buscando ${nomeEscopo}: ${exec.pauta ?? 'Brasil todo, região por região'}` }, 'Começando');
        let parou = '';
        for (const [i, regiao] of regioes.entries()) {
          if (await pediuParar()) { parou = 'Parada pedida no adm.'; break; }
          if (total.custo_usd >= config.limite_execucao_usd) { parou = `Limite por execução atingido (US$ ${config.limite_execucao_usd.toFixed(2)}).`; break; }
          if (gastoAntes + total.custo_usd >= config.limite_mes_usd) { parou = `Limite do mês atingido (US$ ${config.limite_mes_usd.toFixed(2)}).`; break; }
          const prefixo = `Região ${i + 1} de ${regioes.length}`;
          await evento({ tipo: 'info', texto: `${prefixo}: ${regiao}` }, `${prefixo}: ${regiao}`);
          const avisar = (texto: string) => { evento({ tipo: 'info', texto }, `${prefixo}: ${texto}`).catch(() => undefined); };
          const { campanhas, chamadas, motivo } = await buscarCampanhas({ regiao, escopo, hoje, jaEncontradas: await this.campanhas.jaEncontradas() }, avisar);
          await registrarChamadas(chamadas);
          if (motivo) await evento({ tipo: 'descarte', texto: `${regiao}: ${motivo}` });
          encontradas += campanhas.length;
          const { novas, descartes } = await this.campanhas.guardar(campanhas, id, totalDe(chamadas), hoje);
          for (const d of descartes) await evento({ tipo: 'descarte', texto: d });
          for (const n of novas) await evento({ tipo: 'noticia', texto: n });
          rascunhos += novas.length;
          if (!campanhas.length && !motivo) await evento({ tipo: 'info', texto: `${regiao}: nada novo e confiável.` });
        }
        if (parou) await evento({ tipo: 'info', texto: `Parou: ${parou}` });
        const resumo = `${rascunhos} ${rascunhos === 1 ? 'campanha nova' : 'campanhas novas'} para revisar`;
        await evento({ tipo: 'info', texto: `Fim: ${resumo}, US$ ${total.custo_usd.toFixed(2)}` });
        await salvar({ situacao: parou ? 'parada' : 'ok', terminou_em: agora(), etapa: parou ? `Parou: ${parou}` : `Concluída: ${resumo}` });
        return;
      }

      const assuntos = await this.assuntos(exec);
      await evento({ tipo: 'info', texto: exec.pedido === 'pauta' ? `Pauta pedida: "${exec.pauta}" (${assuntos.length})` : `Completando a fila: ${assuntos.length} ${assuntos.length === 1 ? 'notícia' : 'notícias'}` }, 'Começando');

      let parouPorQue = '';
      for (const [i, a] of assuntos.entries()) {
        if (await pediuParar()) { parouPorQue = 'Parada pedida no adm.'; break; }
        if (total.custo_usd >= config.limite_execucao_usd) { parouPorQue = `Limite por execução atingido (US$ ${config.limite_execucao_usd.toFixed(2)}).`; break; }
        if (gastoAntes + total.custo_usd >= config.limite_mes_usd) { parouPorQue = `Limite do mês atingido (US$ ${config.limite_mes_usd.toFixed(2)}).`; break; }

        const prefixo = `Notícia ${i + 1} de ${assuntos.length}`;
        await evento({ tipo: 'info', texto: `${prefixo}: ${a.assunto}` }, `${prefixo}: pesquisando "${a.assunto}"`);
        const avisar = (texto: string) => { evento({ tipo: 'info', texto }, `${prefixo}: ${texto}`).catch(() => undefined); };

        const [jaPublicadas, linksUsados] = await Promise.all([
          this.db.select({ titulo: n.titulo }).from(n).orderBy(desc(n.id)).limit(60),
          this.db.select({ url: n.fonte_url }).from(n).where(isNotNull(n.fonte_url)).orderBy(desc(n.id)).limit(200),
        ]);
        const { rascunho, motivo, chamadas } = await escrever({
          assunto: a.assunto, instrucao: a.instrucao, categoria: a.categoria, tipo: a.tipo, hoje: new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10),
          jaPublicadas: jaPublicadas.map((j) => j.titulo), linksUsados: linksUsados.map((l) => l.url!).filter(Boolean),
        }, avisar);
        await registrarChamadas(chamadas);
        if (a.temaId) await this.db.update(t).set({ usado_em: agora() }).where(eq(t.id, a.temaId));

        if (!rascunho) { await evento({ tipo: 'descarte', texto: `${a.assunto}: ${motivo}`, consumo: totalDe(chamadas) }); continue; }
        encontradas++;
        if (!/^https?:\/\//.test(rascunho.fonte_url)) { await evento({ tipo: 'descarte', texto: `${rascunho.titulo}: veio sem link de fonte válido.`, consumo: totalDe(chamadas) }); continue; }
        if (await this.noticias.jaExiste(rascunho.fonte_url)) { await evento({ tipo: 'descarte', texto: `${rascunho.titulo}: esta fonte já foi usada.`, consumo: totalDe(chamadas) }); continue; }

        const conferir = [...(rascunho.pontos_conferir ?? [])];
        if (!(await linkAbre(rascunho.fonte_url))) conferir.push('Não consegui abrir o link da fonte automaticamente. Confira se ele funciona.');
        const rev = await revisar(rascunho, avisar);
        await registrarChamadas([rev.chamada]);
        conferir.push(...rev.problemas.map((p) => `Revisão: ${p}`));

        avisar('Gerando as capas');
        const categoria = rascunho.categoria in EDITORIAS ? rascunho.categoria : a.categoria ?? 'doacao';
        const capas = await gerarCapas({ titulo: rascunho.titulo, categoria, rotulo: EDITORIAS[categoria as keyof typeof EDITORIAS], resumo: rascunho.resumo });
        const gasto = totalDe([...chamadas, rev.chamada]);

        const nova = await this.noticias.criar({
          titulo: corta(rascunho.titulo, 200), resumo: corta(rascunho.resumo, 400), corpo: rascunho.corpo, o_que_muda: rascunho.o_que_muda,
          categoria, tipo: rascunho.tipo === 'guia' ? 'guia' : 'noticia', fonte_nome: corta(rascunho.fonte_nome, 160), fonte_url: corta(rascunho.fonte_url, 500),
          imagem: capas.capa, texto_instagram: rascunho.texto_instagram,
        }, null, { origem: 'agente', execucao_id: id });
        await this.db.update(n).set({
          tema_id: a.temaId, palavra_chave: corta(rascunho.palavra_chave, 120) || null, titulo_seo: corta(rascunho.titulo_seo, 70) || null,
          imagem_alt: corta(rascunho.imagem_alt, 255) || null, arte_feed: capas.feed, arte_story: capas.story,
          pontos_conferir: conferir.length ? conferir.join('\n') : null,
          tokens_entrada: gasto.tokens_entrada + gasto.cache_leitura + gasto.cache_escrita, tokens_saida: gasto.tokens_saida, buscas: gasto.buscas,
          custo_usd: Number(gasto.custo_usd.toFixed(4)),
        }).where(eq(n.id, nova.id));
        rascunhos++;
        await evento({ tipo: 'noticia', texto: rascunho.titulo, consumo: gasto, noticia_id: nova.id }, `${prefixo}: rascunho pronto`);
      }

      if (parouPorQue) await evento({ tipo: 'info', texto: `Parou: ${parouPorQue}` });
      const resumo = `${rascunhos} ${rascunhos === 1 ? 'rascunho criado' : 'rascunhos criados'}`;
      await evento({ tipo: 'info', texto: `Fim: ${resumo}, US$ ${total.custo_usd.toFixed(2)}` });
      await salvar({ situacao: parouPorQue ? 'parada' : 'ok', terminou_em: agora(), etapa: parouPorQue ? `Parou: ${parouPorQue}` : `Concluída: ${resumo}` });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      this.log.error(`Execução ${id}: ${mensagem}`);
      linha.push({ em: agora(), tipo: 'erro', texto: mensagem.slice(0, 500) });
      await salvar({ situacao: 'erro', erro: mensagem.slice(0, 2000), terminou_em: agora(), etapa: 'Erro: veja a linha do tempo' });
    }
  }

  // Pauta pedida: o mesmo assunto N vezes. Fila: temas ligados, primeiro os que estão há mais tempo sem notícia
  private async assuntos(exec: typeof x.$inferSelect) {
    type Assunto = { assunto: string; instrucao: string | null; categoria: string | null; tipo: 'noticia' | 'guia' | 'qualquer'; temaId: number | null };
    if (exec.pedido === 'pauta') {
      return Array.from({ length: exec.quantidade }, (): Assunto => ({ assunto: exec.pauta!, instrucao: null, categoria: null, tipo: (exec.pauta_tipo as Assunto['tipo']) ?? 'qualquer', temaId: null }));
    }
    const temas = await this.db.select().from(t).where(eq(t.ativo, 1)).orderBy(sql`${t.usado_em} IS NOT NULL`, asc(t.usado_em), asc(t.id));
    if (!temas.length) throw new Error('Nenhum tema ligado em Pautas. Ligue ao menos um tema.');
    return Array.from({ length: exec.quantidade }, (_, i): Assunto => {
      const tema = temas[i % temas.length];
      return { assunto: tema.nome, instrucao: tema.instrucao, categoria: tema.categoria, tipo: 'qualquer', temaId: tema.id };
    });
  }
}

// Muitos sites bloqueiam robôs; aqui só anota para o revisor conferir, não descarta
async function linkAbre(url: string) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SalveMaisUmBot/1.0)' } });
    return r.ok;
  } catch {
    return false;
  }
}
