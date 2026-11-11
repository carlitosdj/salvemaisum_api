import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { and, asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { AdminOnly, AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { agora } from '../common/agora';
import { LimiteTentativas } from '../common/limite';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

// Comentários das notícias: publicados na hora, com revisão automática dos suspeitos e denúncia dos leitores.
const c = schema.noticiaComentario;
const cc = schema.noticiaComentarioCurtida;
const DENUNCIAS_PARA_REVISAO = 3;
const limiteComentar = new LimiteTentativas(10, 10 * 60 * 1000);
const limiteDenunciar = new LimiteTentativas(20, 60 * 60 * 1000);

class ComentarioDto {
  @IsString() @Length(2, 1000, { message: 'Escreva entre 2 e 1.000 caracteres.' }) texto: string;
  @IsOptional() @IsInt() @Type(() => Number) parent_id?: number;
}
class DenunciaDto { @IsOptional() @IsString() @MaxLength(200) motivo?: string; }
class ModerarDto { @IsIn(['publicado', 'oculto', 'removido']) situacao: string; }

// Em notícias de saúde aparecem golpes: link, telefone, venda, "cura garantida". Esses esperam a revisão do adm.
function motivoSuspeita(texto: string): string | null {
  if (/https?:\/\/|www\.|\b[\w-]+\.(com|br|net|org|io|ly|me)\b/i.test(texto)) return 'Contém link';
  if (/(\(?\d{2}\)?\s?)?\d{4,5}[-\s.]?\d{4}\b/.test(texto)) return 'Contém número de telefone';
  if (/\b(pix|vendo|vende|venda|compro|pago|pagamento|r\$|whats\s?app|zap|telegram|ganhe|renda extra|apost[ae]|bet|milagr\w*|garantid[ao]|cura garantida)\b/i.test(texto)) return 'Contém termo suspeito (venda, pagamento ou promessa)';
  return null;
}

@Injectable()
export class ComentarioService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  private async noticiaPublicada(id: number) {
    const [n] = await this.db.select({ id: schema.noticia.id }).from(schema.noticia).where(and(eq(schema.noticia.id, id), eq(schema.noticia.situacao, 'publicada')));
    if (!n) throw new NotFoundException('Notícia não encontrada.');
  }

  // Lista pública: comentários publicados e suas respostas. Removido só aparece se tiver resposta (como "comentário removido").
  async listar(noticiaId: number) {
    const linhas = await this.db
      .select({ id: c.id, parent_id: c.parent_id, texto: c.texto, situacao: c.situacao, curtidas: c.curtidas, created_at: c.created_at, autor_id: c.user_id, nome: schema.profile.name, imagem: schema.profile.image })
      .from(c)
      .innerJoin(schema.user, eq(schema.user.id, c.user_id))
      .leftJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
      .where(and(eq(c.noticia_id, noticiaId), inArray(c.situacao, ['publicado', 'removido'])))
      .orderBy(asc(c.created_at));
    const publicar = (l: (typeof linhas)[number]) => ({
      id: l.id, parent_id: l.parent_id, curtidas: l.curtidas, created_at: l.created_at, removido: l.situacao === 'removido',
      texto: l.situacao === 'removido' ? null : l.texto,
      autor: l.situacao === 'removido' ? null : { id: l.autor_id, nome: l.nome || 'Doador', imagem: l.imagem },
    });
    const respostas = linhas.filter((l) => l.parent_id && l.situacao === 'publicado');
    const raiz = linhas
      .filter((l) => !l.parent_id && (l.situacao === 'publicado' || respostas.some((r) => r.parent_id === l.id)))
      .reverse() // mais novos primeiro; respostas em ordem de conversa
      .map((l) => ({ ...publicar(l), respostas: respostas.filter((r) => r.parent_id === l.id).map(publicar) }));
    return { total: linhas.filter((l) => l.situacao === 'publicado').length, comentarios: raiz };
  }

  async minhasCurtidas(noticiaId: number, usuario: number) {
    const r = await this.db.select({ id: cc.comentario_id }).from(cc).innerJoin(c, eq(c.id, cc.comentario_id)).where(and(eq(cc.user_id, usuario), eq(c.noticia_id, noticiaId)));
    return r.map((x) => x.id);
  }

  async comentar(noticiaId: number, d: ComentarioDto, usuario: number) {
    limiteComentar.verificar(String(usuario));
    await this.noticiaPublicada(noticiaId);
    const texto = d.texto.trim().replace(/\n{3,}/g, '\n\n');
    if (texto.length < 2) throw new BadRequestException('Escreva um comentário.');
    let parent: number | null = null;
    if (d.parent_id) {
      const [p] = await this.db.select({ id: c.id, parent_id: c.parent_id, noticia_id: c.noticia_id, situacao: c.situacao }).from(c).where(eq(c.id, d.parent_id));
      if (!p || p.noticia_id !== noticiaId || p.situacao !== 'publicado') throw new BadRequestException('Este comentário não aceita respostas.');
      parent = p.parent_id ?? p.id; // a conversa tem um nível: resposta de resposta fica no mesmo fio
    }
    const motivo = motivoSuspeita(texto);
    const t = agora();
    const [novo] = await this.db.insert(c).values({ noticia_id: noticiaId, user_id: usuario, parent_id: parent, texto, situacao: motivo ? 'revisao' : 'publicado', motivo_revisao: motivo, created_at: t, updated_at: t }).$returningId();
    return { id: novo.id, situacao: motivo ? 'revisao' : 'publicado' };
  }

  async apagar(id: number, usuario: AuthUser) {
    const [x] = await this.db.select({ user_id: c.user_id }).from(c).where(eq(c.id, id));
    if (!x) throw new NotFoundException('Comentário não encontrado.');
    if (x.user_id !== usuario.id && !usuario.admin) throw new ForbiddenException('Você só pode apagar os seus comentários.');
    await this.db.update(c).set({ situacao: 'removido', updated_at: agora() }).where(eq(c.id, id));
    return { ok: true };
  }

  // Curtir de novo desfaz
  async curtir(id: number, usuario: number) {
    const [x] = await this.db.select({ id: c.id }).from(c).where(and(eq(c.id, id), eq(c.situacao, 'publicado')));
    if (!x) throw new NotFoundException('Comentário não encontrado.');
    const [ja] = await this.db.select().from(cc).where(and(eq(cc.comentario_id, id), eq(cc.user_id, usuario)));
    if (ja) await this.db.delete(cc).where(and(eq(cc.comentario_id, id), eq(cc.user_id, usuario)));
    else await this.db.insert(cc).values({ comentario_id: id, user_id: usuario, created_at: agora() });
    const [total] = await this.db.select({ n: sql<number>`COUNT(*)` }).from(cc).where(eq(cc.comentario_id, id));
    await this.db.update(c).set({ curtidas: Number(total.n) }).where(eq(c.id, id));
    return { curtido: !ja, curtidas: Number(total.n) };
  }

  async denunciar(id: number, d: DenunciaDto, usuario: number) {
    limiteDenunciar.verificar(`${usuario}:${id}`);
    const [x] = await this.db.select({ denuncias: c.denuncias, user_id: c.user_id }).from(c).where(and(eq(c.id, id), eq(c.situacao, 'publicado')));
    if (!x) throw new NotFoundException('Comentário não encontrado.');
    if (x.user_id === usuario) throw new BadRequestException('Você não pode denunciar o seu próprio comentário.');
    const denuncias = x.denuncias + 1;
    const vaiParaRevisao = denuncias >= DENUNCIAS_PARA_REVISAO;
    await this.db.update(c).set({
      denuncias, updated_at: agora(),
      ...(vaiParaRevisao ? { situacao: 'revisao', motivo_revisao: `Denunciado por leitores${d.motivo ? `: ${d.motivo.slice(0, 150)}` : ''}` } : {}),
    }).where(eq(c.id, id));
    return { ok: true };
  }

  // ---------- adm ----------

  async listarAdm(filtro: string) {
    const onde = filtro === 'denunciados' ? and(eq(c.situacao, 'publicado'), gte(c.denuncias, 1))
      : filtro && ['revisao', 'publicado', 'oculto', 'removido'].includes(filtro) ? eq(c.situacao, filtro) : eq(c.situacao, 'revisao');
    const itens = await this.db
      .select({ id: c.id, texto: c.texto, situacao: c.situacao, motivo_revisao: c.motivo_revisao, denuncias: c.denuncias, curtidas: c.curtidas, parent_id: c.parent_id, created_at: c.created_at,
        noticia_id: c.noticia_id, noticia_titulo: schema.noticia.titulo, noticia_slug: schema.noticia.slug, autor_id: c.user_id, autor_nome: schema.profile.name, autor_email: schema.user.email })
      .from(c)
      .innerJoin(schema.noticia, eq(schema.noticia.id, c.noticia_id))
      .innerJoin(schema.user, eq(schema.user.id, c.user_id))
      .leftJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
      .where(onde).orderBy(desc(c.denuncias), desc(c.created_at)).limit(200);
    const contagem = await this.db.select({ situacao: c.situacao, n: sql<number>`COUNT(*)` }).from(c).groupBy(c.situacao);
    const [den] = await this.db.select({ n: sql<number>`COUNT(*)` }).from(c).where(and(eq(c.situacao, 'publicado'), gte(c.denuncias, 1)));
    return { itens, contagem: { ...Object.fromEntries(contagem.map((x) => [x.situacao, Number(x.n)])), denunciados: Number(den.n) } };
  }

  async moderar(id: number, situacao: string, admin: number) {
    const [x] = await this.db.select({ id: c.id }).from(c).where(eq(c.id, id));
    if (!x) throw new NotFoundException('Comentário não encontrado.');
    // Publicar de novo zera as denúncias: o adm já olhou
    await this.db.update(c).set({ situacao, ...(situacao === 'publicado' ? { denuncias: 0, motivo_revisao: null } : {}), moderado_por: admin, moderado_em: agora(), updated_at: agora() }).where(eq(c.id, id));
    return { ok: true };
  }
}

@ApiTags('comentários')
@ApiBearerAuth()
@Controller()
class ComentarioController {
  constructor(private readonly comentarios: ComentarioService) {}

  @SkipAuth() @Get('noticias/:id/comentarios') listar(@Param('id', ParseIntPipe) id: number) { return this.comentarios.listar(id); }
  @Get('noticias/:id/comentarios/minhas-curtidas') minhas(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.comentarios.minhasCurtidas(id, eu.id); }
  @Post('noticias/:id/comentarios') comentar(@Param('id', ParseIntPipe) id: number, @Body() d: ComentarioDto, @CurrentUser() eu: AuthUser) { return this.comentarios.comentar(id, d, eu.id); }
  @Delete('comentarios/:id') apagar(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.comentarios.apagar(id, eu); }
  @Post('comentarios/:id/curtir') curtir(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.comentarios.curtir(id, eu.id); }
  @Post('comentarios/:id/denunciar') denunciar(@Param('id', ParseIntPipe) id: number, @Body() d: DenunciaDto, @CurrentUser() eu: AuthUser) { return this.comentarios.denunciar(id, d, eu.id); }

  @AdminOnly() @Get('admin/comentarios') listarAdm(@Query('filtro') f?: string) { return this.comentarios.listarAdm(f ?? 'revisao'); }
  @AdminOnly() @Put('admin/comentarios/:id') moderar(@Param('id', ParseIntPipe) id: number, @Body() d: ModerarDto, @CurrentUser() eu: AuthUser) { return this.comentarios.moderar(id, d.situacao, eu.id); }
}

@Module({ controllers: [ComentarioController], providers: [ComentarioService] })
export class ComentarioModule {}
