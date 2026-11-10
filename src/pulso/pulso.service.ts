import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import * as sharp from 'sharp';
import { AvisoService } from '../aviso/aviso.service';
import { AuthUser } from '../auth/auth.decorators';
import { CampaignService } from '../campaign/campaign.service';
import { agora } from '../common/agora';
import { nomePublico } from '../common/nome';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { contarValidas, DIA, doaParaTipos, intervaloDe, limiteAnual, nivelDe } from './regras';

const d = schema.doacao;
const r = schema.registroDoacao;
const a = schema.agradecimento;
const c = schema.campaign;

// Fora de UPLOADS_DIR: comprovante nunca é servido como arquivo público.
export const pastaPrivada = () => resolve(process.env.PRIVADO_DIR || 'privado', 'comprovantes');
const SETE_DIAS = 7 * DIA;

@Injectable()
export class PulsoService {
  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly campaigns: CampaignService,
    private readonly avisos: AvisoService,
  ) {}

  private async linhas<T>(consulta: ReturnType<typeof sql>) {
    return ((await this.db.execute(consulta)) as unknown as [T[]])[0];
  }

  async corrente(usuario: number) {
    const nos = await this.linhas<{ id: number; pai: number; nivel: number; doou: number }>(sql`
      WITH RECURSIVE arvore (id, pai, nivel) AS (
        SELECT convidado_id, convidador_id, 1 FROM indicacao WHERE convidador_id = ${usuario}
        UNION ALL
        SELECT i.convidado_id, i.convidador_id, arvore.nivel + 1 FROM indicacao i JOIN arvore ON i.convidador_id = arvore.id WHERE arvore.nivel < 5
      )
      SELECT arvore.id, arvore.pai, arvore.nivel, EXISTS (SELECT 1 FROM registro_doacao x WHERE x.user_id = arvore.id AND x.situacao <> 'recusado') AS doou
      FROM arvore LIMIT 200`);
    // A corrente é anônima: os ids reais não saem daqui.
    const indice = new Map<number, number>(nos.map((n, i) => [Number(n.id), i + 1]));
    indice.set(usuario, 0);
    return {
      convidados: nos.length,
      doaram: nos.filter((n) => Number(n.doou)).length,
      nos: nos.map((n) => ({ i: indice.get(Number(n.id)), pai: indice.get(Number(n.pai)), nivel: Number(n.nivel), doou: !!Number(n.doou) })),
    };
  }

  async pulso(usuario: number) {
    const momento = agora();
    const [perfil] = await this.db
      .select({ tipo: schema.profile.bloodtype, nome: schema.profile.name, cidade: schema.profile.city, sexo: schema.doador.sexo, autorizou: schema.doador.user_id, aceita: schema.doador.aceita_alertas })
      .from(schema.user)
      .innerJoin(schema.profile, eq(schema.user.profileUserId, schema.profile.user_id))
      .leftJoin(schema.doador, eq(schema.doador.user_id, schema.user.id))
      .where(eq(schema.user.id, usuario));

    const [minhas, registros] = await Promise.all([
      this.db.select({ campanha: d.campaign_id }).from(d).where(eq(d.user_id, usuario)),
      this.db.select({ data: r.data, situacao: r.situacao }).from(r).where(and(eq(r.user_id, usuario), ne(r.situacao, 'recusado'))),
    ]);

    const sexo = perfil?.sexo;
    const ultima = registros.length ? Math.max(...registros.map((x) => x.data)) : null;
    const proxima = ultima ? ultima + intervaloDe(sexo) * DIA : null;
    const confirmadas = contarValidas(registros.filter((x) => x.situacao === 'aprovado').map((x) => x.data), sexo);

    // Perfis antigos têm valores fora da lista, como '9', que valem como tipo não informado.
    const tipo = perfil?.tipo && doaParaTipos[perfil.tipo] ? perfil.tipo : null;
    const tipos = tipo ? doaParaTipos[tipo] : [];
    const ja = minhas.map((m) => m.campanha);
    const candidatas = tipos.length
      ? await this.campaigns.compativeis(tipos, ja, perfil?.cidade)
      : [];

    const agradecimentos = await this.db
      .select({ id: a.id, mensagem: a.mensagem, created_at: a.created_at, campanha: c.id, nome: c.name, soPrimeiro: schema.pedidoPrivacidade.so_primeiro_nome })
      .from(a)
      .innerJoin(d, and(eq(d.campaign_id, a.campaign_id), eq(d.user_id, usuario)))
      .innerJoin(c, eq(c.id, a.campaign_id))
      .leftJoin(schema.pedidoPrivacidade, eq(schema.pedidoPrivacidade.campaign_id, c.id))
      .where(eq(a.oculto, 0))
      .orderBy(desc(a.created_at))
      .limit(5);

    return {
      nome: perfil?.nome ?? '',
      tipo,
      status: {
        ultima, proxima, podeHoje: !proxima || momento >= proxima,
        estimado: !sexo,
      },
      anel: { feitas: registros.filter((x) => x.data > momento - 365 * DIA).length, limite: limiteAnual(sexo) },
      nivel: nivelDe(confirmadas),
      pendentes: registros.filter((x) => x.situacao === 'declarada').length,
      compativeis: candidatas.map((x) => this.campaigns.publica(x)),
      alertas: { faltam: await this.faltamParaAlertas(usuario, perfil) },
      corrente: await this.corrente(usuario),
      agradecimentos: agradecimentos.map(({ soPrimeiro, nome, ...x }) => ({ ...x, nome: nomePublico(nome, soPrimeiro) })),
      time: await this.meuTime(usuario),
    };
  }

  // O que ainda impede esta pessoa de receber alertas por perto
  private async faltamParaAlertas(usuario: number, perfil?: { tipo: string | null; cidade: number | null; autorizou: number | null; aceita: number | null }) {
    const [inscrito] = await this.db.select({ id: schema.pushInscricao.id }).from(schema.pushInscricao).where(eq(schema.pushInscricao.user_id, usuario)).limit(1);
    return [
      !(perfil?.tipo && doaParaTipos[perfil.tipo]) && 'tipo',
      !perfil?.cidade && 'cidade',
      (!perfil?.autorizou || !perfil.aceita) && 'autorizacao',
      !inscrito && 'notificacoes',
    ].filter(Boolean) as string[];
  }

  private async meuTime(usuario: number) {
    const [t] = await this.db
      .select({ id: schema.time.id, nome: schema.time.nome })
      .from(schema.timeMembro)
      .innerJoin(schema.time, eq(schema.time.id, schema.timeMembro.time_id))
      .where(eq(schema.timeMembro.user_id, usuario));
    return t ?? null;
  }

  // Só conta para contas novas: ninguém entra na corrente de outro depois de já estar na rede.
  async aceitarConvite(usuario: number, convidador: number) {
    if (usuario === convidador) return { ok: false };
    const [eu] = await this.db.select({ criado: schema.user.created_at }).from(schema.user).where(eq(schema.user.id, usuario));
    const [quem] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, convidador));
    if (!eu || !quem || eu.criado < agora() - SETE_DIAS) return { ok: false };
    const [r] = await this.db.insert(schema.indicacao).ignore().values({ convidado_id: usuario, convidador_id: convidador, created_at: agora() });
    const novo = !!(r as unknown as { affectedRows: number }).affectedRows;
    if (novo) {
      this.avisos.enviar(convidador, { titulo: 'Sua corrente cresceu!', corpo: 'Alguém aceitou seu convite para doar sangue.', url: '/', tag: 'corrente' }).catch(() => undefined);
    }
    return { ok: novo };
  }

  // Agradecimentos

  listarAgradecimentos(campanha: number) {
    return this.db.select({ id: a.id, mensagem: a.mensagem, created_at: a.created_at }).from(a)
      .where(and(eq(a.campaign_id, campanha), eq(a.oculto, 0))).orderBy(desc(a.created_at)).limit(30);
  }

  async agradecer(campanhaId: number, mensagem: string, eu: AuthUser) {
    const campanha = await this.campaigns.uma(campanhaId);
    if (!eu.admin && campanha.user_id !== eu.id) throw new ForbiddenException('Só quem publicou o pedido pode agradecer.');
    await this.db.insert(a).values({ campaign_id: campanhaId, autor_id: eu.id, mensagem, created_at: agora() });
    const doadores = await this.db.select({ id: d.user_id }).from(d).where(eq(d.campaign_id, campanhaId));
    for (const x of doadores) {
      if (x.id !== eu.id) {
        this.avisos.enviar(x.id, { titulo: 'Você recebeu um agradecimento', corpo: mensagem.slice(0, 120), url: `/campanha/${campanhaId}`, tag: `obrigado-${campanhaId}` }).catch(() => undefined);
      }
    }
    return this.listarAgradecimentos(campanhaId);
  }

  // Comprovantes

  async enviarComprovante(id: number, usuario: number, imagem: Buffer) {
    const [registro] = await this.db.select().from(r).where(eq(r.id, id));
    if (!registro || registro.user_id !== usuario) throw new NotFoundException('Registro inexistente.');
    if (registro.situacao === 'aprovado') throw new BadRequestException('Esta doação já foi confirmada.');

    await mkdir(pastaPrivada(), { recursive: true });
    const nome = `${crypto.randomUUID()}.webp`;
    // Recodificar remove metadados (como localização) e impede arquivo disfarçado de imagem.
    let pronta: Buffer;
    try {
      pronta = await sharp(imagem).rotate().resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    } catch {
      throw new BadRequestException('Envie uma imagem JPG, PNG ou WEBP.');
    }
    await writeFile(join(pastaPrivada(), nome), pronta);
    await this.db.update(r).set({ arquivo: nome, situacao: 'pendente', revisado_por: null, revisado_em: null }).where(eq(r.id, id));
    if (registro.arquivo) await unlink(join(pastaPrivada(), registro.arquivo)).catch(() => undefined);
    return { situacao: 'pendente' };
  }

  listarComprovantes(situacao: string) {
    return this.db
      .select({
        doacao: r.id, situacao: r.situacao, enviado_em: r.created_at, tem_arquivo: sql<number>`${r.arquivo} IS NOT NULL`,
        doou_em: r.data, pessoa: schema.profile.name, email: schema.user.email,
        pedido: sql<string>`COALESCE(${c.name}, ${schema.bloodcenter.name}, 'Doação sem pedido')`,
      })
      .from(r)
      .innerJoin(schema.user, eq(schema.user.id, r.user_id))
      .leftJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
      .leftJoin(c, eq(c.id, r.campaign_id))
      .leftJoin(schema.bloodcenter, eq(schema.bloodcenter.id, r.bloodcenter_id))
      .where(eq(r.situacao, situacao))
      .orderBy(desc(r.created_at))
      .limit(100);
  }

  async caminhoComprovante(id: number) {
    const [linha] = await this.db.select({ arquivo: r.arquivo }).from(r).where(eq(r.id, id));
    if (!linha?.arquivo) throw new NotFoundException('Arquivo indisponível.');
    return join(pastaPrivada(), linha.arquivo);
  }

  // Depois de revisar, a foto é apagada: guardamos só o resultado.
  async revisarComprovante(id: number, situacao: 'aprovado' | 'recusado', eu: AuthUser) {
    const [linha] = await this.db.select().from(r).where(eq(r.id, id));
    if (!linha) throw new NotFoundException('Registro inexistente.');
    await this.db.update(r).set({ situacao, arquivo: null, revisado_por: eu.id, revisado_em: agora() }).where(eq(r.id, id));
    if (linha.arquivo) await unlink(join(pastaPrivada(), linha.arquivo)).catch(() => undefined);
    const aprovado = situacao === 'aprovado';
    this.avisos.enviar(linha.user_id, {
      titulo: aprovado ? 'Doação confirmada!' : 'Comprovante não aceito',
      corpo: aprovado ? 'Sua doação foi confirmada e já conta para o seu nível.' : 'Não conseguimos confirmar sua doação. Envie outra foto do comprovante.',
      url: '/jornada',
      tag: `comprovante-${id}`,
    }).catch(() => undefined);
    return { situacao };
  }

  // Moderação de agradecimentos

  todosAgradecimentos() {
    return this.db.select({ id: a.id, mensagem: a.mensagem, oculto: a.oculto, created_at: a.created_at, pedido: c.name, autor: schema.user.email })
      .from(a).innerJoin(c, eq(c.id, a.campaign_id)).innerJoin(schema.user, eq(schema.user.id, a.autor_id)).orderBy(desc(a.id)).limit(100);
  }

  async ocultarAgradecimento(id: number, oculto: boolean) {
    await this.db.update(a).set({ oculto: oculto ? 1 : 0 }).where(eq(a.id, id));
    return { id, oculto };
  }

  // Disputa coletiva

  cidades() {
    return this.linhas<{ cidade: string; uf: string; doacoes: number }>(sql`
      SELECT ci.name AS cidade, st.state AS uf, COUNT(*) AS doacoes
      FROM registro_doacao x JOIN user u ON u.id = x.user_id JOIN profile p ON p.user_id = u.profileUserId
      JOIN city ci ON ci.id = p.city LEFT JOIN state st ON st.id = ci.state
      WHERE x.situacao <> 'recusado' GROUP BY ci.id, ci.name, st.state ORDER BY doacoes DESC LIMIT 10`);
  }

  // Times de empresa vêm com o nome e o logo do parceiro (campos time_id e logo na tabela component, página 18)
  times() {
    return this.linhas<{ id: number; nome: string; tipo: string; cidade: string | null; membros: number; confirmadas: number; empresa: string | null; logo: string | null }>(sql`
      SELECT t.id, t.nome, t.tipo, ci.name AS cidade, COUNT(DISTINCT m.user_id) AS membros, COUNT(DISTINCT x.id) AS confirmadas,
        MAX(pc.name) AS empresa, MAX(lg.value_extra) AS logo
      FROM \`time\` t LEFT JOIN city ci ON ci.id = t.cidade LEFT JOIN time_membro m ON m.time_id = t.id
      LEFT JOIN registro_doacao x ON x.user_id = m.user_id AND x.situacao = 'aprovado'
      LEFT JOIN component_extra ve ON ve.key_extra = 'time_id' AND ve.value_extra = CAST(t.id AS CHAR)
      LEFT JOIN component pc ON pc.id = ve.component_id AND pc.component_id = 18
      LEFT JOIN component_extra lg ON lg.component_id = pc.id AND lg.key_extra = 'logo'
      GROUP BY t.id, t.nome, t.tipo, ci.name ORDER BY confirmadas DESC, membros DESC, t.id ASC LIMIT 50`);
  }

  async criarTime(dados: { nome: string; tipo: string; cidade?: number }, usuario: number) {
    const [novo] = await this.db.insert(schema.time).values({ nome: dados.nome.trim(), tipo: dados.tipo, cidade: dados.cidade, criado_por: usuario, created_at: agora() }).$returningId();
    await this.entrarNoTime(novo.id, usuario);
    return { id: novo.id };
  }

  // Cada pessoa joga por um time de cada vez.
  // Time de empresa só aceita quem chega pelo link de convite.
  async entrarNoTime(id: number, usuario: number, viaConvite = false) {
    const [t] = await this.db.select({ id: schema.time.id }).from(schema.time).where(eq(schema.time.id, id));
    if (!t) throw new NotFoundException('Time inexistente.');
    if (!viaConvite) {
      const [empresa] = await this.linhas<{ id: number }>(sql`
        SELECT c.id FROM component_extra e JOIN component c ON c.id = e.component_id AND c.component_id = 18
        WHERE e.key_extra = 'time_id' AND e.value_extra = ${String(id)} LIMIT 1`);
      if (empresa) throw new BadRequestException('Este é o time de uma empresa. Para entrar, use o link de convite enviado por ela.');
    }
    await this.sairDoTime(usuario);
    await this.db.insert(schema.timeMembro).values({ time_id: id, user_id: usuario, created_at: agora() });
    return { ok: true };
  }

  async sairDoTime(usuario: number) {
    await this.db.delete(schema.timeMembro).where(eq(schema.timeMembro.user_id, usuario));
    return { ok: true };
  }

  async removerTime(id: number) {
    await this.db.delete(schema.time).where(eq(schema.time.id, id));
    return id;
  }
}

