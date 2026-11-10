import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, like, notInArray, or, sql, SQL } from 'drizzle-orm';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { AuthUser } from '../auth/auth.decorators';
import { TIPOS_SANGUINEOS } from '../user/user.dto';
import { CampaignDto } from './campaign.dto';
import { agora } from '../common/agora';
import { nomePublico } from '../common/nome';
import { distanciaKm } from '../common/geo';

const RELACOES = {
  verificacao: true,
  statusPedido: true,
  privacidade: true,
  meta: true,
  parentUser: true,
  cityParent: true,
  stateParent: true,
  bcParent: { with: { cityParent: true, stateParent: true } },
} as const;

export const STATUS_ATIVA = 1;
const POR_PAGINA_MAX = 100;

const c = schema.campaign;

// Pedido sem linha em campaign_status continua ativo: o prazo automático está desligado.
export const pedidoAberto = sql`${c.id} NOT IN (SELECT campaign_id FROM campaign_status WHERE situacao <> 'ativo')`;

@Injectable()
export class CampaignService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  // Pessoas que marcaram "vou doar" e "doei" em cada pedido
  async contagens(ids: number[]) {
    const vazio = { vou_doar: 0, doei: 0 };
    const mapa: Record<number, { vou_doar: number; doei: number }> = Object.fromEntries(ids.map((id) => [id, { ...vazio }]));
    if (!ids.length) return mapa;
    const linhas = await this.db
      .select({ id: schema.doacao.campaign_id, situacao: schema.doacao.situacao, total: count() })
      .from(schema.doacao)
      .where(inArray(schema.doacao.campaign_id, ids))
      .groupBy(schema.doacao.campaign_id, schema.doacao.situacao);
    for (const l of linhas) mapa[l.id][l.situacao as 'vou_doar' | 'doei'] = l.total;
    return mapa;
  }

  private async comAcoes<T extends { id: number }>(itens: T[]) {
    const acoes = await this.contagens(itens.map((i) => i.id));
    return itens.map((i) => ({ ...i, acoes: acoes[i.id] }));
  }

  async paginar(pagina: number, quantidade: number, filtro?: SQL) {
    const take = Math.min(Math.max(quantidade, 1), POR_PAGINA_MAX);
    const [data, [{ total }]] = await Promise.all([
      this.db.query.campaign.findMany({
        with: RELACOES,
        where: filtro,
        orderBy: desc(c.id),
        limit: take,
        offset: take * (Math.max(pagina, 1) - 1),
      }),
      this.db.select({ total: count() }).from(c).where(filtro),
    ]);
    return { data: await this.comAcoes(data), count: total };
  }

  listarPublicas(pagina: number, quantidade: number, tipos?: string) {
    const lista = (tipos ?? '').split(',').filter((t) => TIPOS_SANGUINEOS.includes(t));
    const filtro = and(eq(c.status, STATUS_ATIVA), pedidoAberto, lista.length ? inArray(c.bloodtype, lista) : undefined);
    return this.paginar(pagina, quantidade, filtro);
  }

  async numeros() {
    const contar = async (tabela: typeof c | typeof schema.user | typeof schema.bloodcenter) => {
      const [{ total }] = await this.db.select({ total: count() }).from(tabela);
      return total;
    };
    const [pessoas, pedidos, hemocentros] = await Promise.all([contar(schema.user), contar(c), contar(schema.bloodcenter)]);
    return { pessoas, pedidos, hemocentros };
  }

  async doUsuario(id: number) {
    return this.comAcoes(await this.db.query.campaign.findMany({ with: RELACOES, where: eq(c.user_id, id), orderBy: desc(c.id) }));
  }

  private filtroBusca(termo: string) {
    const padrao = `%${termo}%`;
    return or(
      like(c.name, padrao),
      like(schema.city.name, padrao),
      like(schema.state.name, padrao),
      like(schema.state.state, padrao),
      like(schema.bloodcenter.name, padrao),
    );
  }

  async idsDaBusca(termo: string, filtro?: SQL) {
    const linhas = await this.db
      .select({ id: c.id })
      .from(c)
      .leftJoin(schema.bloodcenter, eq(c.bc, schema.bloodcenter.id))
      .leftJoin(schema.city, or(eq(c.bccity, schema.city.id), eq(schema.bloodcenter.bccity, schema.city.id)))
      .leftJoin(schema.state, or(eq(c.bcstate, schema.state.id), eq(schema.bloodcenter.bcstate, schema.state.id)))
      .where(and(this.filtroBusca(termo), filtro));
    return [...new Set(linhas.map((l) => l.id))];
  }

  async buscar(termo: string) {
    const ids = await this.idsDaBusca(termo, and(eq(c.status, STATUS_ATIVA), pedidoAberto));
    if (!ids.length) return [];
    return this.comAcoes(await this.db.query.campaign.findMany({ with: RELACOES, where: inArray(c.id, ids), orderBy: desc(c.id) }));
  }

  async contarCompativeis(lista: string) {
    const tipos = lista.split(',').filter((t) => TIPOS_SANGUINEOS.includes(t));
    if (!tipos.length) return { cnt: 0 };
    const [{ cnt }] = await this.db
      .select({ cnt: count() })
      .from(c)
      .where(and(inArray(c.bloodtype, tipos), eq(c.status, STATUS_ATIVA), pedidoAberto));
    return { cnt };
  }

  async uma(id: number) {
    const campanha = await this.db.query.campaign.findFirst({ with: RELACOES, where: eq(c.id, id) });
    if (!campanha) throw new NotFoundException('Campanha inexistente');
    const [completa] = await this.comAcoes([campanha]);
    return completa;
  }

  // O que o público vê: o nome respeita a escolha da família e os dados do consentimento não saem daqui.
  publica<T extends { name: string | null; privacidade?: { so_primeiro_nome: number } | null; meta?: { meta_doadores: number } | null; statusPedido?: { situacao: string } | null; verificacao?: { fonte: string } | null }>(campanha: T) {
    const { privacidade, meta, statusPedido, verificacao, ...resto } = campanha;
    return {
      ...resto,
      verificado: !!verificacao,
      situacao: statusPedido?.situacao ?? 'ativo',
      name: nomePublico(campanha.name, privacidade?.so_primeiro_nome),
      so_primeiro_nome: !!privacidade?.so_primeiro_nome,
      meta: meta?.meta_doadores ?? null,
    };
  }

  // Pedidos ativos que esta pessoa pode atender, do mais perto para o mais longe
  async compativeis(tipos: string[], excluir: number[], cidadeOrigem?: number | null) {
    const b = schema.bloodcenter;
    const candidatos = await this.db
      .select({ id: c.id, cidade: sql<number | null>`COALESCE(${c.bccity}, ${b.bccity})` })
      .from(c)
      .leftJoin(b, eq(c.bc, b.id))
      .where(and(eq(c.status, STATUS_ATIVA), pedidoAberto, inArray(c.bloodtype, tipos), excluir.length ? notInArray(c.id, excluir) : undefined))
      .orderBy(desc(c.id));
    const cidades = [...new Set([...candidatos.map((x) => x.cidade), cidadeOrigem].filter(Boolean))] as number[];
    const pontos = new Map((cidades.length ? await this.db.select().from(schema.cidadeCoordenada).where(inArray(schema.cidadeCoordenada.city_id, cidades)) : []).map((p) => [p.city_id, p]));
    const origem = cidadeOrigem ? pontos.get(cidadeOrigem) : undefined;
    const comDistancia = candidatos.map((x) => {
      const destino = x.cidade ? pontos.get(x.cidade) : undefined;
      return { id: x.id, km: origem && destino ? distanciaKm(origem, destino) : null };
    });
    const escolhidos = comDistancia.sort((p, q) => (p.km ?? Infinity) - (q.km ?? Infinity)).slice(0, 3);
    if (!escolhidos.length) return [];
    const linhas = await this.comAcoes(await this.db.query.campaign.findMany({ with: RELACOES, where: inArray(c.id, escolhidos.map((x) => x.id)) }));
    return escolhidos.map((e) => ({ ...linhas.find((l) => l.id === e.id), distancia_km: e.km }));
  }

  private async registrarMeta(id: number, { meta_doadores: meta }: CampaignDto) {
    if (meta === undefined) return;
    if (meta === null) {
      await this.db.delete(schema.campaignMeta).where(eq(schema.campaignMeta.campaign_id, id));
      return;
    }
    await this.db.insert(schema.campaignMeta).values({ campaign_id: id, meta_doadores: meta, updated_at: agora() }).onDuplicateKeyUpdate({ set: { meta_doadores: meta, updated_at: agora() } });
  }

  private async registrarPrivacidade(id: number, dados: CampaignDto, eu: AuthUser) {
    if (!dados.consentimento || !dados.vinculo) return;
    const so = dados.so_primeiro_nome ? 1 : 0;
    const momento = agora();
    await this.db
      .insert(schema.pedidoPrivacidade)
      .values({ campaign_id: id, consentido_em: momento, autorizado_por: eu.id, vinculo: dados.vinculo, so_primeiro_nome: so, updated_at: momento })
      .onDuplicateKeyUpdate({ set: { vinculo: dados.vinculo, so_primeiro_nome: so, updated_at: momento } });
  }

  private valores({ bcParent, consentimento, vinculo, so_primeiro_nome, meta_doadores, ...resto }: CampaignDto) {
    return { ...resto, ...(bcParent !== undefined ? { bc: bcParent } : {}) };
  }

  async criar(dados: CampaignDto, eu: AuthUser) {
    if (!dados.consentimento || !dados.vinculo) throw new BadRequestException('Confirme a autorização do paciente ou da família.');
    const [nova] = await this.db
      .insert(c)
      .values({ ...this.valores(dados), user_id: eu.id, status: STATUS_ATIVA, created_at: Date.now() / 1000 })
      .$returningId();
    await this.registrarPrivacidade(nova.id, dados, eu);
    await this.registrarMeta(nova.id, dados);
    return this.uma(nova.id);
  }

  private async exigirDono(id: number, eu: AuthUser) {
    const campanha = await this.uma(id);
    if (!eu.admin && campanha.user_id !== eu.id) throw new ForbiddenException('Acesso negado.');
  }

  async atualizar(id: number, dados: CampaignDto, eu: AuthUser) {
    await this.exigirDono(id, eu);
    const valores = this.valores(dados);
    if (Object.keys(valores).length) await this.db.update(c).set(valores).where(eq(c.id, id));
    await this.registrarPrivacidade(id, dados, eu);
    await this.registrarMeta(id, dados);
    return this.uma(id);
  }

  async alterarSituacao(id: number, situacao: string, eu: AuthUser) {
    await this.exigirDono(id, eu);
    const momento = agora();
    await this.db.insert(schema.campaignStatus).values({ campaign_id: id, situacao, updated_at: momento }).onDuplicateKeyUpdate({ set: { situacao, updated_at: momento } });
    return this.publica(await this.uma(id));
  }

  async paraEdicao(id: number, eu: AuthUser) {
    await this.exigirDono(id, eu);
    return this.uma(id);
  }

  async remover(id: number, eu: AuthUser) {
    await this.exigirDono(id, eu);
    await this.db.delete(c).where(eq(c.id, id));
    return id;
  }

  async alterarStatus(id: number, status: number) {
    await this.uma(id);
    await this.db.update(c).set({ status }).where(eq(c.id, id));
    return this.uma(id);
  }
}
