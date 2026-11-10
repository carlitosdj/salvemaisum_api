import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsEmail, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { and, asc, between, desc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { AdminOnly, AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { AvisoModule } from '../aviso/aviso.module';
import { AvisoService } from '../aviso/aviso.service';
import { agora } from '../common/agora';
import { LimiteTentativas } from '../common/limite';
import { primeiroNome } from '../common/nome';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import { contarValidas, DIA, intervaloDe } from '../pulso/regras';
import * as schema from '../_schemas/schema';

class AgendaDto {
  @IsInt() @Type(() => Number) quando: number;
  @IsOptional() @IsInt() @Type(() => Number) bloodcenter_id?: number;
  @IsOptional() @IsInt() @Type(() => Number) campaign_id?: number;
}
class PlantaoDto { @IsInt() @Type(() => Number) inicio: number; }
class MedulaDto { @IsOptional() @IsInt() @Type(() => Number) cadastrado_em?: number; }
class DestaqueDto {
  @IsInt() @Min(202601) @Max(209912) @Type(() => Number) mes: number;
  @Length(2, 80) nome: string;
  @Length(10, 800) historia: string;
  @IsOptional() @IsString() @MaxLength(255) foto?: string;
  @Equals(true, { message: 'Confirme a autorização da pessoa.' }) autorizado: boolean;
}
class VerificacaoDto { @Length(3, 120) fonte: string; }
class DenunciaDto { @Length(5, 500, { message: 'Explique o motivo em até 500 caracteres.' }) motivo: string; }
class MensagemDto { @Length(1, 500) texto: string; }
class LoteDto {
  @IsEmail() email: string;
  @IsArray() @ArrayMaxSize(200) @IsInt({ each: true }) datas: number[];
}

const reg = schema.registroDoacao;
const ag = schema.doacaoAgenda;
const pl = schema.plantao;
const ap = schema.apadrinhamento;
const msg = schema.apadrinhamentoMensagem;
const SEMANA = 7 * DIA;
export const MINIMO_PADRINHO = 5;
const MAX_AFILHADOS = 3;
const limiteMensagens = new LimiteTentativas(60, 60 * 60 * 1000);

@Injectable()
export class CicloService {
  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly avisos: AvisoService,
  ) {}

  private async sexo(usuario: number) {
    const [d] = await this.db.select({ sexo: schema.doador.sexo }).from(schema.doador).where(eq(schema.doador.user_id, usuario));
    return d?.sexo;
  }

  async confirmadas(usuario: number, inicio?: number, fim?: number) {
    const filtros = [eq(reg.user_id, usuario), eq(reg.situacao, 'aprovado'), inicio !== undefined ? between(reg.data, inicio, fim) : undefined];
    const linhas = await this.db.select({ data: reg.data }).from(reg).where(and(...filtros));
    return contarValidas(linhas.map((l) => l.data), await this.sexo(usuario));
  }

  // Agenda: lembrete pessoal, não é reserva de vaga no hemocentro.
  async minhaAgenda(usuario: number) {
    const [linha] = await this.db
      .select({ id: ag.id, quando: ag.quando, hemocentro: schema.bloodcenter.name, endereco: schema.bloodcenter.address, telefone: schema.bloodcenter.phone, campaign_id: ag.campaign_id })
      .from(ag).leftJoin(schema.bloodcenter, eq(schema.bloodcenter.id, ag.bloodcenter_id))
      .where(and(eq(ag.user_id, usuario), gt(ag.quando, agora()))).orderBy(asc(ag.quando)).limit(1);
    return linha ?? null;
  }

  async agendar(usuario: number, d: AgendaDto) {
    const momento = agora();
    if (d.quando <= momento) throw new BadRequestException('Escolha uma data futura.');
    if (d.quando > momento + 180 * DIA) throw new BadRequestException('Escolha uma data nos próximos 6 meses.');
    const [ultima] = await this.db.select({ data: reg.data }).from(reg).where(and(eq(reg.user_id, usuario), ne(reg.situacao, 'recusado'))).orderBy(desc(reg.data)).limit(1);
    if (ultima && d.quando < ultima.data + intervaloDe(await this.sexo(usuario)) * DIA) {
      throw new BadRequestException('Nessa data você ainda estará no intervalo entre doações.');
    }
    await this.db.delete(ag).where(and(eq(ag.user_id, usuario), gt(ag.quando, momento)));
    await this.db.insert(ag).values({ user_id: usuario, quando: d.quando, bloodcenter_id: d.bloodcenter_id, campaign_id: d.campaign_id, created_at: momento });
    return this.minhaAgenda(usuario);
  }

  async cancelarAgenda(id: number, usuario: number) {
    await this.db.delete(ag).where(and(eq(ag.id, id), eq(ag.user_id, usuario)));
    return { ok: true };
  }

  // Plantão
  async meuPlantao(usuario: number) {
    const [linha] = await this.db.select().from(pl).where(and(eq(pl.user_id, usuario), gt(pl.fim, agora()))).orderBy(asc(pl.inicio)).limit(1);
    return linha ?? null;
  }

  async entrarNoPlantao(usuario: number, inicio: number) {
    const momento = agora();
    if (inicio < momento - DIA || inicio > momento + 120 * DIA) throw new BadRequestException('Escolha uma semana nos próximos 4 meses.');
    const [doador] = await this.db.select().from(schema.doador).where(eq(schema.doador.user_id, usuario));
    if (!doador?.aceita_alertas) throw new BadRequestException('Autorize os alertas em Minha jornada antes de entrar no plantão.');
    const [recente] = await this.db.select({ id: pl.id }).from(pl).where(and(eq(pl.user_id, usuario), between(pl.inicio, inicio - 90 * DIA, inicio + 90 * DIA)));
    if (recente) throw new BadRequestException('Cada pessoa fica de plantão uma semana por trimestre.');
    await this.db.insert(pl).values({ user_id: usuario, inicio, fim: inicio + SEMANA, created_at: momento });
    return this.meuPlantao(usuario);
  }

  async sairDoPlantao(id: number, usuario: number) {
    await this.db.delete(pl).where(and(eq(pl.id, id), eq(pl.user_id, usuario)));
    return { ok: true };
  }

  // Medula
  async minhaMedula(usuario: number) {
    const [linha] = await this.db.select().from(schema.medulaContato).where(eq(schema.medulaContato.user_id, usuario));
    return linha ?? null;
  }

  async confirmarMedula(usuario: number, cadastradoEm?: number) {
    const momento = agora();
    await this.db.insert(schema.medulaContato).values({ user_id: usuario, cadastrado_em: cadastradoEm, confirmado_em: momento })
      .onDuplicateKeyUpdate({ set: { confirmado_em: momento, ...(cadastradoEm ? { cadastrado_em: cadastradoEm } : {}) } });
    return this.minhaMedula(usuario);
  }

  async sairDaMedula(usuario: number) {
    await this.db.delete(schema.medulaContato).where(eq(schema.medulaContato.user_id, usuario));
    return { ok: true };
  }

  // Destaques
  destaques() {
    return this.db.select({ id: schema.destaqueMes.id, mes: schema.destaqueMes.mes, nome: schema.destaqueMes.nome, historia: schema.destaqueMes.historia, foto: schema.destaqueMes.foto })
      .from(schema.destaqueMes).orderBy(desc(schema.destaqueMes.mes), desc(schema.destaqueMes.id)).limit(6);
  }

  async criarDestaque(d: DestaqueDto) {
    const momento = agora();
    await this.db.insert(schema.destaqueMes).values({ mes: d.mes, nome: d.nome.trim(), historia: d.historia.trim(), foto: d.foto, autorizado_em: momento, created_at: momento });
    return this.destaques();
  }

  async removerDestaque(id: number) {
    await this.db.delete(schema.destaqueMes).where(eq(schema.destaqueMes.id, id));
    return id;
  }

  // Confiança nos pedidos
  async verificar(campanha: number, fonte: string, eu: AuthUser) {
    const momento = agora();
    await this.db.insert(schema.pedidoVerificacao).values({ campaign_id: campanha, verificado_por: eu.id, verificado_em: momento, fonte: fonte.trim() })
      .onDuplicateKeyUpdate({ set: { verificado_por: eu.id, verificado_em: momento, fonte: fonte.trim() } });
    return { ok: true };
  }

  async removerVerificacao(campanha: number) {
    await this.db.delete(schema.pedidoVerificacao).where(eq(schema.pedidoVerificacao.campaign_id, campanha));
    return { ok: true };
  }

  async denunciar(campanha: number, autor: number, motivo: string) {
    const [c] = await this.db.select({ id: schema.campaign.id }).from(schema.campaign).where(eq(schema.campaign.id, campanha));
    if (!c) throw new NotFoundException('Pedido inexistente.');
    await this.db.insert(schema.pedidoDenuncia).ignore().values({ campaign_id: campanha, autor_id: autor, motivo: motivo.trim(), created_at: agora() });
    return { ok: true };
  }

  denuncias() {
    const d = schema.pedidoDenuncia;
    return this.db.select({ id: d.id, campaign_id: d.campaign_id, motivo: d.motivo, created_at: d.created_at, pedido: schema.campaign.name, autor: schema.user.email })
      .from(d).innerJoin(schema.campaign, eq(schema.campaign.id, d.campaign_id)).innerJoin(schema.user, eq(schema.user.id, d.autor_id))
      .where(isNull(d.resolvida_em)).orderBy(desc(d.id)).limit(100);
  }

  async resolverDenuncia(id: number) {
    await this.db.update(schema.pedidoDenuncia).set({ resolvida_em: agora() }).where(eq(schema.pedidoDenuncia.id, id));
    return { ok: true };
  }

  // Lançamento em lote, a partir da carteirinha ou declaração do hemocentro
  async lancarLote(email: string, datas: number[], eu: AuthUser) {
    const [alvo] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
    if (!alvo) throw new NotFoundException('Nenhuma conta com esse e-mail.');
    const momento = agora();
    const existentes = (await this.db.select({ data: reg.data }).from(reg).where(and(eq(reg.user_id, alvo.id), ne(reg.situacao, 'recusado')))).map((x) => x.data);
    let criadas = 0;
    let ignoradas = 0;
    for (const data of [...datas].sort((a, b) => a - b)) {
      if (data > momento || existentes.some((x) => Math.abs(x - data) < SEMANA)) { ignoradas += 1; continue; }
      await this.db.insert(reg).values({ user_id: alvo.id, data, origem: 'historico', situacao: 'aprovado', revisado_por: eu.id, revisado_em: momento, created_at: momento });
      existentes.push(data);
      criadas += 1;
    }
    return { criadas, ignoradas, validas: await this.confirmadas(alvo.id) };
  }

  // Certificado anual
  async certificado(usuario: number, ano: number) {
    const inicio = Math.floor(Date.UTC(ano, 0, 1) / 1000);
    const fim = Math.floor(Date.UTC(ano + 1, 0, 1) / 1000) - 1;
    const [perfil] = await this.db.select({ nome: schema.profile.name }).from(schema.user).innerJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId)).where(eq(schema.user.id, usuario));
    const doacoes = await this.confirmadas(usuario, inicio, fim);
    if (!doacoes) throw new NotFoundException('Nenhuma doação confirmada nesse ano.');
    return { nome: perfil?.nome ?? '', ano, doacoes };
  }

  // Padrinho do primeiro doador
  private async meus(usuario: number) {
    const linhas = await this.db.select().from(ap).where(and(or(eq(ap.novato_id, usuario), eq(ap.padrinho_id, usuario)), inArray(ap.situacao, ['aberto', 'ativo']))).orderBy(desc(ap.id));
    const ids = [...new Set(linhas.flatMap((l) => [l.novato_id, l.padrinho_id]).filter(Boolean))] as number[];
    const nomes = new Map((ids.length ? await this.db.select({ id: schema.user.id, nome: schema.profile.name }).from(schema.user).innerJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId)).where(inArray(schema.user.id, ids)) : []).map((x) => [x.id, x.nome]));
    return linhas.map((l) => {
      const novato = l.novato_id === usuario;
      const outro = novato ? l.padrinho_id : l.novato_id;
      return { id: l.id, situacao: l.situacao, papel: novato ? 'novato' : 'padrinho', outro: outro ? primeiroNome(nomes.get(outro)) : null };
    });
  }

  async padrinho(usuario: number) {
    const confirmadas = await this.confirmadas(usuario);
    const elegivel = confirmadas >= MINIMO_PADRINHO;
    const [registro] = await this.db.select({ id: reg.id }).from(reg).where(and(eq(reg.user_id, usuario), ne(reg.situacao, 'recusado'))).limit(1);
    const abertos = elegivel
      ? await this.db.select({ id: ap.id, nome: schema.profile.name, cidade: schema.city.name, uf: schema.state.state })
        .from(ap).innerJoin(schema.user, eq(schema.user.id, ap.novato_id)).innerJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
        .leftJoin(schema.city, eq(schema.city.id, schema.profile.city)).leftJoin(schema.state, eq(schema.state.id, schema.city.state))
        .where(and(eq(ap.situacao, 'aberto'), ne(ap.novato_id, usuario))).orderBy(desc(ap.id)).limit(20)
      : [];
    return { confirmadas, minimo: MINIMO_PADRINHO, elegivel, novato: !registro, meus: await this.meus(usuario), abertos: abertos.map((a) => ({ ...a, nome: primeiroNome(a.nome) })) };
  }

  async pedirPadrinho(usuario: number) {
    const [registro] = await this.db.select({ id: reg.id }).from(reg).where(and(eq(reg.user_id, usuario), ne(reg.situacao, 'recusado'))).limit(1);
    if (registro) throw new BadRequestException('O padrinho é para quem vai doar pela primeira vez.');
    const [ativo] = await this.db.select({ id: ap.id }).from(ap).where(and(eq(ap.novato_id, usuario), inArray(ap.situacao, ['aberto', 'ativo'])));
    if (ativo) throw new BadRequestException('Você já tem um pedido de padrinho.');
    await this.db.insert(ap).values({ novato_id: usuario, created_at: agora() });
    return this.padrinho(usuario);
  }

  async aceitarAfilhado(id: number, usuario: number) {
    if ((await this.confirmadas(usuario)) < MINIMO_PADRINHO) throw new ForbiddenException('Padrinhos precisam de ao menos 5 doações confirmadas.');
    const atuais = await this.db.select({ id: ap.id }).from(ap).where(and(eq(ap.padrinho_id, usuario), eq(ap.situacao, 'ativo')));
    if (atuais.length >= MAX_AFILHADOS) throw new BadRequestException('Você já acompanha 3 novatos.');
    const [pedido] = await this.db.select().from(ap).where(eq(ap.id, id));
    if (!pedido || pedido.novato_id === usuario) throw new NotFoundException('Pedido indisponível.');
    const [r] = await this.db.update(ap).set({ padrinho_id: usuario, situacao: 'ativo' }).where(and(eq(ap.id, id), eq(ap.situacao, 'aberto')));
    if (!(r as unknown as { affectedRows: number }).affectedRows) throw new BadRequestException('Outra pessoa já aceitou este pedido.');
    this.avisos.enviar(pedido.novato_id, { titulo: 'Você ganhou um padrinho!', corpo: 'Um doador experiente vai acompanhar sua primeira doação.', url: '/padrinho', tag: `padrinho-${id}` }).catch(() => undefined);
    return this.padrinho(usuario);
  }

  private async participante(id: number, usuario: number) {
    const [linha] = await this.db.select().from(ap).where(eq(ap.id, id));
    if (!linha || (linha.novato_id !== usuario && linha.padrinho_id !== usuario)) throw new ForbiddenException('Acesso negado.');
    return linha;
  }

  async mensagens(id: number, usuario: number) {
    await this.participante(id, usuario);
    const linhas = await this.db.select({ id: msg.id, autor_id: msg.autor_id, texto: msg.texto, created_at: msg.created_at }).from(msg).where(eq(msg.apadrinhamento_id, id)).orderBy(asc(msg.id)).limit(200);
    return linhas.map(({ autor_id, ...m }) => ({ ...m, minha: autor_id === usuario }));
  }

  async enviarMensagem(id: number, usuario: number, texto: string) {
    const linha = await this.participante(id, usuario);
    if (linha.situacao !== 'ativo') throw new BadRequestException('Esta conversa foi encerrada.');
    limiteMensagens.verificar(String(usuario));
    await this.db.insert(msg).values({ apadrinhamento_id: id, autor_id: usuario, texto: texto.trim(), created_at: agora() });
    const destino = linha.novato_id === usuario ? linha.padrinho_id : linha.novato_id;
    this.avisos.enviar(destino, { titulo: 'Nova mensagem', corpo: 'Você recebeu uma mensagem no Salve Mais Um.', url: '/padrinho', tag: `conversa-${id}` }).catch(() => undefined);
    return this.mensagens(id, usuario);
  }

  async encerrar(id: number, usuario: number) {
    await this.participante(id, usuario);
    await this.db.update(ap).set({ situacao: 'encerrado' }).where(eq(ap.id, id));
    return this.padrinho(usuario);
  }
}

@ApiTags('ciclo')
@ApiBearerAuth()
@Controller()
class CicloController {
  constructor(private readonly ciclo: CicloService) {}

  @Get('agenda/me') agenda(@CurrentUser() eu: AuthUser) { return this.ciclo.minhaAgenda(eu.id); }
  @Post('agenda') agendar(@CurrentUser() eu: AuthUser, @Body() d: AgendaDto) { return this.ciclo.agendar(eu.id, d); }
  @Delete('agenda/:id') cancelar(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.ciclo.cancelarAgenda(id, eu.id); }

  @Get('plantao/me') plantao(@CurrentUser() eu: AuthUser) { return this.ciclo.meuPlantao(eu.id); }
  @Post('plantao') entrar(@CurrentUser() eu: AuthUser, @Body() d: PlantaoDto) { return this.ciclo.entrarNoPlantao(eu.id, d.inicio); }
  @Delete('plantao/:id') sair(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.ciclo.sairDoPlantao(id, eu.id); }

  @Get('medula/me') medula(@CurrentUser() eu: AuthUser) { return this.ciclo.minhaMedula(eu.id); }
  @Put('medula/me') confirmar(@CurrentUser() eu: AuthUser, @Body() d: MedulaDto) { return this.ciclo.confirmarMedula(eu.id, d.cadastrado_em); }
  @Delete('medula/me') sairMedula(@CurrentUser() eu: AuthUser) { return this.ciclo.sairDaMedula(eu.id); }

  @SkipAuth() @Get('destaques') destaques() { return this.ciclo.destaques(); }
  @AdminOnly() @Post('admin/destaques') criarDestaque(@Body() d: DestaqueDto) { return this.ciclo.criarDestaque(d); }
  @AdminOnly() @Delete('admin/destaques/:id') removerDestaque(@Param('id', ParseIntPipe) id: number) { return this.ciclo.removerDestaque(id); }

  @Post('campaign/:id/denuncia') denunciar(@Param('id', ParseIntPipe) id: number, @Body() d: DenunciaDto, @CurrentUser() eu: AuthUser) { return this.ciclo.denunciar(id, eu.id, d.motivo); }
  @AdminOnly() @Get('admin/denuncias') denuncias() { return this.ciclo.denuncias(); }
  @AdminOnly() @Patch('admin/denuncias/:id') resolver(@Param('id', ParseIntPipe) id: number) { return this.ciclo.resolverDenuncia(id); }
  @AdminOnly() @Put('admin/campaigns/:id/verificacao') verificar(@Param('id', ParseIntPipe) id: number, @Body() d: VerificacaoDto, @CurrentUser() eu: AuthUser) { return this.ciclo.verificar(id, d.fonte, eu); }
  @AdminOnly() @Delete('admin/campaigns/:id/verificacao') tirar(@Param('id', ParseIntPipe) id: number) { return this.ciclo.removerVerificacao(id); }

  @AdminOnly() @Post('admin/registros/lote') lote(@Body() d: LoteDto, @CurrentUser() eu: AuthUser) { return this.ciclo.lancarLote(d.email, d.datas, eu); }

  @Get('certificado/:ano') certificado(@Param('ano', ParseIntPipe) ano: number, @CurrentUser() eu: AuthUser) { return this.ciclo.certificado(eu.id, ano); }

  @Get('padrinho') padrinho(@CurrentUser() eu: AuthUser) { return this.ciclo.padrinho(eu.id); }
  @Post('padrinho/pedir') pedir(@CurrentUser() eu: AuthUser) { return this.ciclo.pedirPadrinho(eu.id); }
  @Post('padrinho/:id/aceitar') aceitar(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.ciclo.aceitarAfilhado(id, eu.id); }
  @Get('padrinho/:id/mensagens') mensagens(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.ciclo.mensagens(id, eu.id); }
  @Post('padrinho/:id/mensagens') enviar(@Param('id', ParseIntPipe) id: number, @Body() d: MensagemDto, @CurrentUser() eu: AuthUser) { return this.ciclo.enviarMensagem(id, eu.id, d.texto); }
  @Post('padrinho/:id/encerrar') encerrar(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.ciclo.encerrar(id, eu.id); }
}

@Module({ imports: [AvisoModule], controllers: [CicloController], providers: [CicloService] })
export class CicloModule {}
