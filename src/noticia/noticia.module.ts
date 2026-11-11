import { BadRequestException, Body, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { and, desc, eq, lte, ne, or, sql } from 'drizzle-orm';
import { AdminOnly, AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { agora } from '../common/agora';
import { idDoSlug, slug } from '../common/slug';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { CHAVES_EDITORIAS, EDITORIAS } from '../agente/editorias';
import { gerarCapas } from '../agente/capas';

// Blog do Salve Mais Um. Rascunhos vêm do adm ou do agente; só o admin publica ou agenda.
export const CATEGORIAS = CHAVES_EDITORIAS;
export const SITUACOES = ['rascunho', 'agendada', 'publicada', 'descartada'] as const;
const n = schema.noticia;
const POR_PAGINA = 12;

export class NoticiaDto {
  @IsString() @Length(3, 200) titulo: string;
  @IsOptional() @IsString() @MaxLength(400) resumo?: string;
  @IsOptional() @IsString() @MaxLength(20000) corpo?: string;
  @IsOptional() @IsString() @MaxLength(3000) o_que_muda?: string;
  @IsOptional() @IsIn(CATEGORIAS) categoria?: string;
  @IsOptional() @IsIn(['noticia', 'guia']) tipo?: string;
  @IsOptional() @IsString() @MaxLength(160) fonte_nome?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'O link da fonte precisa começar com http:// ou https://' }) @MaxLength(500) fonte_url?: string;
  @IsOptional() @IsString() @MaxLength(255) imagem?: string;
  @IsOptional() @IsString() @MaxLength(3000) texto_instagram?: string;
  @IsOptional() @IsString() @MaxLength(70) titulo_seo?: string;
  @IsOptional() @IsString() @MaxLength(120) palavra_chave?: string;
  @IsOptional() @IsString() @MaxLength(255) imagem_alt?: string;
  @IsOptional() @IsString() @MaxLength(5000) pontos_conferir?: string;
}

class PublicarDto { @IsOptional() @IsInt() @Type(() => Number) quando?: number; }

// Campos que o site mostra. Instagram, origem e quem criou ficam só no adm.
const publica = (x: typeof n.$inferSelect) => ({
  id: x.id, slug: x.slug, tipo: x.tipo, categoria: x.categoria, titulo: x.titulo, resumo: x.resumo, corpo: x.corpo,
  o_que_muda: x.o_que_muda, fonte_nome: x.fonte_nome, fonte_url: x.fonte_url, imagem: x.imagem, imagem_alt: x.imagem_alt,
  titulo_seo: x.titulo_seo, palavra_chave: x.palavra_chave, publicada_em: x.publicada_em,
});

const vazioParaNull = (d: NoticiaDto) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? null : typeof v === 'string' ? v.trim() : v]));

@Injectable()
export class NoticiaService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  // Agendadas cujo horário chegou viram publicadas na primeira leitura
  private async liberarAgendadas() {
    const t = agora();
    await this.db.update(n).set({ situacao: 'publicada', publicada_em: sql`${n.publicar_em}`, updated_at: t })
      .where(and(eq(n.situacao, 'agendada'), lte(n.publicar_em, t)));
  }

  async publicadas(categoria?: string, pagina = 1) {
    await this.liberarAgendadas();
    const onde = and(eq(n.situacao, 'publicada'), categoria && (CATEGORIAS as readonly string[]).includes(categoria) ? eq(n.categoria, categoria) : undefined);
    const [itens, [total]] = await Promise.all([
      this.db.select().from(n).where(onde).orderBy(desc(n.publicada_em), desc(n.id)).limit(POR_PAGINA).offset((Math.max(1, pagina) - 1) * POR_PAGINA),
      this.db.select({ total: sql<number>`COUNT(*)` }).from(n).where(onde),
    ]);
    return { itens: itens.map(publica), total: Number(total.total), por_pagina: POR_PAGINA };
  }

  async publicada(valor: string) {
    await this.liberarAgendadas();
    const id = idDoSlug(valor);
    const [x] = id ? await this.db.select().from(n).where(and(eq(n.id, id), eq(n.situacao, 'publicada'))) : [];
    if (!x) throw new NotFoundException('Notícia não encontrada.');
    const relacionadas = await this.db.select().from(n)
      .where(and(eq(n.situacao, 'publicada'), ne(n.id, x.id), x.categoria ? or(eq(n.categoria, x.categoria), eq(n.tipo, 'guia')) : undefined))
      .orderBy(desc(n.publicada_em)).limit(3);
    return { ...publica(x), relacionadas: relacionadas.map(publica) };
  }

  // ---------- adm ----------

  async listar(situacao?: string) {
    await this.liberarAgendadas();
    const onde = situacao && (SITUACOES as readonly string[]).includes(situacao) ? eq(n.situacao, situacao) : undefined;
    const itens = await this.db.select().from(n).where(onde).orderBy(desc(n.updated_at)).limit(200);
    const contagem = await this.db.select({ situacao: n.situacao, total: sql<number>`COUNT(*)` }).from(n).groupBy(n.situacao);
    return { itens, contagem: Object.fromEntries(contagem.map((c) => [c.situacao, Number(c.total)])) };
  }

  async uma(id: number) {
    const [x] = await this.db.select().from(n).where(eq(n.id, id));
    if (!x) throw new NotFoundException('Notícia não encontrada.');
    return x;
  }

  async criar(d: NoticiaDto, autor: number | null, extra: { origem?: string; execucao_id?: number } = {}) {
    const t = agora();
    const [novo] = await this.db.insert(n).values({
      ...vazioParaNull(d), titulo: d.titulo.trim(), slug: `rascunho-${t}-${Math.random().toString(36).slice(2, 8)}`,
      criado_por: autor, origem: extra.origem ?? 'manual', execucao_id: extra.execucao_id, created_at: t, updated_at: t,
    }).$returningId();
    await this.db.update(n).set({ slug: slug([d.titulo], novo.id) }).where(eq(n.id, novo.id));
    return this.uma(novo.id);
  }

  async atualizar(id: number, d: NoticiaDto) {
    await this.uma(id);
    await this.db.update(n).set({ ...vazioParaNull(d), titulo: d.titulo.trim(), slug: slug([d.titulo], id), updated_at: agora() }).where(eq(n.id, id));
    return this.uma(id);
  }

  async publicar(id: number, quando?: number) {
    const x = await this.uma(id);
    if (!x.titulo || !x.corpo) throw new BadRequestException('Antes de publicar, preencha título e texto.');
    const t = agora();
    const agendar = quando && quando > t + 60;
    await this.db.update(n).set(agendar
      ? { situacao: 'agendada', publicar_em: quando, publicada_em: null, updated_at: t }
      : { situacao: 'publicada', publicar_em: null, publicada_em: x.publicada_em ?? t, updated_at: t }).where(eq(n.id, id));
    return this.uma(id);
  }

  async mudarSituacao(id: number, situacao: 'rascunho' | 'descartada') {
    await this.uma(id);
    await this.db.update(n).set({ situacao, publicar_em: null, updated_at: agora() }).where(eq(n.id, id));
    return this.uma(id);
  }

  async remover(id: number) {
    await this.uma(id);
    await this.db.delete(n).where(eq(n.id, id));
    return id;
  }

  // Refaz as três artes com o título e o resumo atuais (depois de editar o texto)
  async refazerCapas(id: number) {
    const x = await this.uma(id);
    const categoria = x.categoria && x.categoria in EDITORIAS ? x.categoria : 'doacao';
    const capas = await gerarCapas({ titulo: x.titulo, categoria, rotulo: EDITORIAS[categoria as keyof typeof EDITORIAS], resumo: x.resumo });
    await this.db.update(n).set({ imagem: capas.capa, arte_feed: capas.feed, arte_story: capas.story, updated_at: agora() }).where(eq(n.id, id));
    return this.uma(id);
  }

  // Para o agente não sugerir duas vezes a mesma notícia
  async jaExiste(fonteUrl: string) {
    const [x] = await this.db.select({ id: n.id }).from(n).where(eq(n.fonte_url, fonteUrl)).limit(1);
    return !!x;
  }
}

@ApiTags('notícias')
@ApiBearerAuth()
@Controller()
class NoticiaController {
  constructor(private readonly noticias: NoticiaService) {}

  @SkipAuth() @Get('noticias') publicadas(@Query('categoria') c?: string, @Query('pagina') p?: string) { return this.noticias.publicadas(c, Number(p) || 1); }
  @SkipAuth() @Get('noticias/:slug') publicada(@Param('slug') s: string) { return this.noticias.publicada(s); }

  @AdminOnly() @Get('admin/noticias') listar(@Query('situacao') s?: string) { return this.noticias.listar(s); }
  @AdminOnly() @Get('admin/noticias/:id') uma(@Param('id', ParseIntPipe) id: number) { return this.noticias.uma(id); }
  @AdminOnly() @Post('admin/noticias') criar(@Body() d: NoticiaDto, @CurrentUser() eu: AuthUser) { return this.noticias.criar(d, eu.id); }
  @AdminOnly() @Put('admin/noticias/:id') atualizar(@Param('id', ParseIntPipe) id: number, @Body() d: NoticiaDto) { return this.noticias.atualizar(id, d); }
  @AdminOnly() @Post('admin/noticias/:id/publicar') publicar(@Param('id', ParseIntPipe) id: number, @Body() d: PublicarDto) { return this.noticias.publicar(id, d.quando); }
  @AdminOnly() @Post('admin/noticias/:id/rascunho') rascunho(@Param('id', ParseIntPipe) id: number) { return this.noticias.mudarSituacao(id, 'rascunho'); }
  @AdminOnly() @Post('admin/noticias/:id/capas') capas(@Param('id', ParseIntPipe) id: number) { return this.noticias.refazerCapas(id); }
  @AdminOnly() @Post('admin/noticias/:id/descartar') descartar(@Param('id', ParseIntPipe) id: number) { return this.noticias.mudarSituacao(id, 'descartada'); }
  @AdminOnly() @Delete('admin/noticias/:id') remover(@Param('id', ParseIntPipe) id: number) { return this.noticias.remover(id); }
}

@Module({ controllers: [NoticiaController], providers: [NoticiaService], exports: [NoticiaService] })
export class NoticiaModule {}
