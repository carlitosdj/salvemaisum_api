import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { aliasedTable, and, between, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, notExists, or, sql } from 'drizzle-orm';
import { agora } from '../common/agora';
import { nomePublico } from '../common/nome';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { Aviso, AvisoService } from './aviso.service';
import { distanciaKm } from '../common/geo';
import { pedidoAberto } from '../campaign/campaign.service';
import { doaParaTipos } from '../pulso/regras';

const DIA = 86400;
const UMA_HORA_MS = 3600 * 1000;
const POR_CICLO = 200;
const d = schema.doacao;
const e = schema.avisoEnviado;

const j = schema.doador;
const r = schema.registroDoacao;
// Quem não informou o sexo usa 90 dias, que serve para qualquer pessoa.
const diasParaApto = (sexo?: string | null) => (sexo === 'm' ? 60 : 90);
// Fadiga de alerta é o que faz a pessoa desligar tudo
const MAXIMO_ALERTAS_30_DIAS = 4;
const MAXIMO_NO_PLANTAO = 8;
const JANELA_PLANTAO = 2 * 3600;
const querAvisos = or(isNull(j.user_id), eq(j.aceita_alertas, 1));

@Injectable()
export class LembreteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Lembretes');
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly avisos: AvisoService,
  ) {}

  onModuleInit() {
    this.timers.push(setTimeout(() => this.ciclo(), 60000), setInterval(() => this.ciclo(), UMA_HORA_MS));
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  // Ninguém recebe lembrete de madrugada
  private horarioPermitido() {
    const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    return hora >= 9 && hora < 20;
  }

  private async ciclo() {
    if (!this.avisos.ligado || !this.horarioPermitido()) return;
    try {
      const enviados = await this.processar();
      this.logger.log(`Ciclo concluído: ${enviados} enviados`);
    } catch (erro) {
      this.logger.error('Falha no ciclo de lembretes', erro);
    }
  }

  private inscritos() {
    return this.db.selectDistinct({ id: schema.pushInscricao.user_id }).from(schema.pushInscricao);
  }

  // Reserva antes de enviar: mesmo com duas instâncias rodando, a pessoa recebe uma vez só.
  private async entregar(usuario: number, tipo: string, referencia: number, aviso: Aviso) {
    const [reserva] = await this.db.insert(e).ignore().values({ user_id: usuario, tipo, referencia, created_at: agora() });
    if (!(reserva as unknown as { affectedRows: number }).affectedRows) return 0;
    const entregues = await this.avisos.enviar(usuario, aviso);
    if (!entregues) {
      await this.db.delete(e).where(and(eq(e.user_id, usuario), eq(e.tipo, tipo), eq(e.referencia, referencia)));
      return 0;
    }
    return 1;
  }

  private jaAvisado(tipo: string, referencia: typeof d.id | typeof d.campaign_id) {
    return and(eq(e.user_id, d.user_id), eq(e.tipo, tipo), eq(e.referencia, referencia));
  }

  // Só pedidos recém-criados, e só para quem autorizou, é compatível, está no raio e pode doar.
  private async alertas(momento: number) {
    const b = schema.bloodcenter;
    const c = schema.campaign;
    const pedidos = await this.db
      .select({ id: c.id, nome: c.name, tipo: c.bloodtype, dono: c.user_id, criado: c.created_at, cidade: sql<number | null>`COALESCE(${c.bccity}, ${b.bccity})`, soPrimeiro: schema.pedidoPrivacidade.so_primeiro_nome })
      .from(c)
      .leftJoin(b, eq(c.bc, b.id))
      .leftJoin(schema.pedidoPrivacidade, eq(schema.pedidoPrivacidade.campaign_id, c.id))
      .where(and(eq(c.status, 1), pedidoAberto, gte(c.created_at, momento - 3 * DIA)))
      .limit(50);
    if (!pedidos.length) return 0;

    const pessoas = await this.db
      .select({ id: j.user_id, raio: j.raio_km, sexo: j.sexo, tipo: schema.profile.bloodtype, cidade: schema.profile.city })
      .from(j)
      .innerJoin(schema.user, eq(schema.user.id, j.user_id))
      .innerJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
      .where(and(eq(j.aceita_alertas, 1), isNotNull(schema.profile.bloodtype), isNotNull(schema.profile.city), inArray(j.user_id, this.inscritos())));
    if (!pessoas.length) return 0;

    const ids = pessoas.map((p) => p.id);
    const cidades = [...new Set([...pedidos.map((p) => p.cidade), ...pessoas.map((p) => p.cidade)].filter(Boolean))] as number[];
    const [pontos, doacoes, recebidos, plantoes] = await Promise.all([
      this.db.select().from(schema.cidadeCoordenada).where(inArray(schema.cidadeCoordenada.city_id, cidades)),
      this.db.select({ id: r.user_id, ultima: sql<number>`MAX(${r.data})` }).from(r).where(and(inArray(r.user_id, ids), ne(r.situacao, 'recusado'))).groupBy(r.user_id),
      this.db.select({ id: e.user_id, total: sql<number>`COUNT(*)` }).from(e).where(and(inArray(e.user_id, ids), eq(e.tipo, 'alerta'), gte(e.created_at, momento - 30 * DIA))).groupBy(e.user_id),
      this.db.select({ id: schema.plantao.user_id }).from(schema.plantao).where(and(inArray(schema.plantao.user_id, ids), lte(schema.plantao.inicio, momento), gt(schema.plantao.fim, momento))),
    ]);
    const dePlantao = new Set(plantoes.map((x) => x.id));
    const ponto = new Map(pontos.map((p) => [p.city_id, p]));
    const ultima = new Map(doacoes.map((x) => [x.id, Number(x.ultima)]));
    const usados = new Map(recebidos.map((x) => [x.id, Number(x.total)]));

    let enviados = 0;
    for (const pedido of pedidos) {
      const destino = pedido.cidade ? ponto.get(pedido.cidade) : undefined;
      if (!destino) continue;
      for (const p of pessoas) {
        const origem = ponto.get(p.cidade);
        if (!origem || p.id === pedido.dono || !doaParaTipos[p.tipo]?.includes(pedido.tipo)) continue;
        // Quem está de plantão é chamado primeiro, de mais longe e com limite maior
        const plantonista = dePlantao.has(p.id);
        if (!plantonista && momento - pedido.criado < JANELA_PLANTAO) continue;
        if ((usados.get(p.id) ?? 0) >= (plantonista ? MAXIMO_NO_PLANTAO : MAXIMO_ALERTAS_30_DIAS)) continue;
        if (ultima.has(p.id) && ultima.get(p.id) > momento - diasParaApto(p.sexo) * DIA) continue;
        const km = distanciaKm(origem, destino);
        if (km > (plantonista ? p.raio * 2 : p.raio)) continue;
        const foi = await this.entregar(p.id, 'alerta', pedido.id, {
          titulo: plantonista ? 'Você está de plantão' : 'Seu sangue é compatível',
          corpo: `${nomePublico(pedido.nome, pedido.soPrimeiro)} precisa de doação a ${km} km de você.`,
          url: `/campanha/${pedido.id}`,
          tag: `alerta-${pedido.id}`,
        });
        if (foi) usados.set(p.id, (usados.get(p.id) ?? 0) + 1);
        enviados += foi;
      }
    }
    return enviados;
  }

  // Na véspera do dia marcado
  private async vesperas(momento: number) {
    const a = schema.doacaoAgenda;
    const lista = await this.db
      .select({ id: a.id, usuario: a.user_id, quando: a.quando, hemocentro: schema.bloodcenter.name })
      .from(a).leftJoin(schema.bloodcenter, eq(schema.bloodcenter.id, a.bloodcenter_id)).leftJoin(j, eq(j.user_id, a.user_id))
      .where(and(between(a.quando, momento, momento + 36 * 3600), querAvisos, inArray(a.user_id, this.inscritos()))).limit(POR_CICLO);
    let enviados = 0;
    for (const x of lista) {
      enviados += await this.entregar(x.usuario, 'vespera', x.id, {
        titulo: 'Sua doação é amanhã',
        corpo: `${x.hemocentro ? `Em ${x.hemocentro}. ` : ''}Durma bem, beba água, faça uma refeição leve e leve documento com foto.`,
        url: '/agendar',
        tag: `vespera-${x.id}`,
      });
    }
    return enviados;
  }

  private anoAtual() {
    return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }));
  }

  // Um telefone antigo pode custar a chance de um paciente
  private async medula(momento: number) {
    const m = schema.medulaContato;
    const lista = await this.db.select({ usuario: m.user_id }).from(m).leftJoin(j, eq(j.user_id, m.user_id))
      .where(and(lte(m.confirmado_em, momento - 365 * DIA), querAvisos, inArray(m.user_id, this.inscritos()))).limit(POR_CICLO);
    let enviados = 0;
    for (const x of lista) {
      enviados += await this.entregar(x.usuario, 'medula', this.anoAtual(), { titulo: 'Seu contato no REDOME está em dia?', corpo: 'Confirme telefone e endereço: é assim que encontram você se surgir um paciente compatível.', url: '/medula', tag: 'medula' });
    }
    return enviados;
  }

  // Quem doou e parou há mais de um ano recebe um convite por ano
  private async campanhasRetorno(momento: number) {
    const ultimas = await this.db.select({ usuario: r.user_id, ultima: sql<number>`MAX(${r.data})` }).from(r).leftJoin(j, eq(j.user_id, r.user_id))
      .where(and(ne(r.situacao, 'recusado'), querAvisos, inArray(r.user_id, this.inscritos()))).groupBy(r.user_id);
    let enviados = 0;
    for (const x of ultimas.filter((u) => Number(u.ultima) < momento - 365 * DIA).slice(0, POR_CICLO)) {
      enviados += await this.entregar(x.usuario, 'retorno', this.anoAtual(), { titulo: 'Faz tempo que você salvou alguém', corpo: 'Já passou mais de um ano da sua última doação. Que tal voltar?', url: '/posso-doar', tag: 'retorno' });
    }
    return enviados;
  }

  // 14/06, Dia Mundial do Doador, e 25/11, Dia Nacional
  private async homenagens(momento: number, hoje = new Date()) {
    const dia = Number(hoje.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', day: 'numeric' }));
    const mes = Number(hoje.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric' }));
    if (!((mes === 6 && dia === 14) || (mes === 11 && dia === 25))) return 0;
    const lista = await this.db.selectDistinct({ usuario: r.user_id }).from(r).leftJoin(j, eq(j.user_id, r.user_id))
      .where(and(ne(r.situacao, 'recusado'), querAvisos, inArray(r.user_id, this.inscritos()))).limit(2000);
    const referencia = this.anoAtual() * 10000 + mes * 100 + dia;
    let enviados = 0;
    for (const x of lista) {
      enviados += await this.entregar(x.usuario, 'homenagem', referencia, { titulo: 'Hoje o dia é seu', corpo: 'Feliz dia do doador de sangue. Obrigado por salvar mais um.', url: '/', tag: 'homenagem' });
    }
    return enviados;
  }

  async processar() {
    const momento = agora();

    const pendentes = await this.db
      .select({ usuario: d.user_id, campanha: d.campaign_id, nome: schema.campaign.name, soPrimeiro: schema.pedidoPrivacidade.so_primeiro_nome })
      .from(d)
      .innerJoin(schema.campaign, eq(d.campaign_id, schema.campaign.id))
      .leftJoin(schema.pedidoPrivacidade, eq(schema.pedidoPrivacidade.campaign_id, schema.campaign.id))
      .leftJoin(e, this.jaAvisado('vou_doar', d.campaign_id))
      .leftJoin(j, eq(j.user_id, d.user_id))
      .where(and(
        eq(d.situacao, 'vou_doar'),
        between(d.updated_at, momento - 14 * DIA, momento - 2 * DIA),
        eq(schema.campaign.status, 1),
        pedidoAberto,
        isNull(e.id),
        querAvisos,
        inArray(d.user_id, this.inscritos()),
      ))
      .limit(POR_CICLO);

    const posterior = aliasedTable(r, 'posterior');
    const possiveis = await this.db
      .select({ usuario: r.user_id, doacao: r.id, doouEm: r.data, sexo: j.sexo })
      .from(r)
      .leftJoin(e, and(eq(e.user_id, r.user_id), eq(e.tipo, 'volta_apto'), eq(e.referencia, r.id)))
      .leftJoin(j, eq(j.user_id, r.user_id))
      .where(and(
        ne(r.situacao, 'recusado'),
        between(r.data, momento - 120 * DIA, momento - 60 * DIA),
        isNull(e.id),
        querAvisos,
        inArray(r.user_id, this.inscritos()),
        notExists(this.db.select({ id: posterior.id }).from(posterior).where(and(eq(posterior.user_id, r.user_id), gt(posterior.data, r.data)))),
      ))
      .limit(POR_CICLO);
    const aptos = possiveis.filter((a) => a.doouEm <= momento - diasParaApto(a.sexo) * DIA);

    let enviados = 0;
    for (const p of pendentes) {
      enviados += await this.entregar(p.usuario, 'vou_doar', p.campanha, {
        titulo: 'Conseguiu doar?',
        corpo: `Você marcou que ia doar para ${nomePublico(p.nome, p.soPrimeiro)}. Se já doou, toque aqui e registre.`,
        url: `/campanha/${p.campanha}`,
        tag: `lembrete-${p.campanha}`,
      });
    }
    for (const a of aptos) {
      enviados += await this.entregar(a.usuario, 'volta_apto', a.doacao, {
        titulo: 'Você pode doar de novo',
        corpo: `Já se passaram ${diasParaApto(a.sexo)} dias desde sua última doação registrada. Veja se está apto e salve mais um.`,
        url: '/jornada',
        tag: 'volta-apto',
      });
    }
    enviados += await this.alertas(momento);
    enviados += await this.vesperas(momento);
    enviados += await this.medula(momento);
    enviados += await this.campanhasRetorno(momento);
    enviados += await this.homenagens(momento);
    return enviados;
  }
}
