import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsInt, IsOptional, Length, Min } from 'class-validator';
import { and, between, eq, inArray, ne } from 'drizzle-orm';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { AdminOnly, AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { agora } from '../common/agora';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import { pastaPrivada } from '../pulso/pulso.service';
import { contarValidas, DIA, intervaloDe, marcoDe } from '../pulso/regras';
import * as schema from '../_schemas/schema';

class RegistroDto {
  @IsInt() @Min(0) @Type(() => Number) data: number;
  @IsOptional() @IsInt() @Type(() => Number) bloodcenter_id?: number;
}

class MuralDto {
  @Equals(true, { message: 'É preciso autorizar a exibição no mural.' }) consentimento: boolean;
  @Length(2, 60, { message: 'O nome deve ter entre 2 e 60 caracteres.' }) nome_exibido: string;
  @IsBoolean() mostrar_cidade: boolean;
}

class MapaQuery {
  @IsOptional() @IsIn(['1', '2', '3', '4', '5', '6', '7', '8']) tipo?: string;
}

const r = schema.registroDoacao;
const m = schema.muralDoador;
const ANO = 365 * DIA;
const JANELA_DUPLICADA = 7 * DIA;
// Abaixo disso, um número por cidade poderia identificar alguém.
const GRUPO_MINIMO = 5;

@Injectable()
export class RegistroService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  async registrar(usuario: number, dados: RegistroDto) {
    const momento = agora();
    if (dados.data > momento + DIA) throw new BadRequestException('A data da doação não pode estar no futuro.');
    if (dados.data < momento - 60 * ANO) throw new BadRequestException('Confira a data da doação.');

    const perto = await this.db.select({ id: r.id }).from(r)
      .where(and(eq(r.user_id, usuario), between(r.data, dados.data - JANELA_DUPLICADA, dados.data + JANELA_DUPLICADA), ne(r.situacao, 'recusado')));
    if (perto.length) throw new BadRequestException('Você já registrou uma doação nessa data.');

    const [novo] = await this.db.insert(r).values({
      user_id: usuario, data: dados.data, bloodcenter_id: dados.bloodcenter_id, origem: dados.data < momento - 30 * DIA ? 'historico' : 'avulsa', created_at: momento,
    }).$returningId();

    const [perfil] = await this.db.select({ sexo: schema.doador.sexo }).from(schema.doador).where(eq(schema.doador.user_id, usuario));
    const datas = await this.db.select({ data: r.data }).from(r).where(and(eq(r.user_id, usuario), ne(r.situacao, 'recusado')));
    const validas = contarValidas(datas.map((x) => x.data), perfil?.sexo);
    return { id: novo.id, conta: validas === datas.length };
  }

  async apagar(id: number, usuario: number) {
    const [linha] = await this.db.select().from(r).where(eq(r.id, id));
    if (!linha) throw new NotFoundException('Registro inexistente.');
    if (linha.user_id !== usuario) throw new ForbiddenException('Acesso negado.');
    if (linha.situacao === 'aprovado') throw new BadRequestException('Doação confirmada não pode ser apagada.');
    if (linha.campaign_id) throw new BadRequestException('Para desfazer, toque em Doei no pedido.');
    await this.db.delete(r).where(eq(r.id, id));
    if (linha.arquivo) await unlink(join(pastaPrivada(), linha.arquivo)).catch(() => undefined);
    return id;
  }

  // Mural: só quem aderiu, sem tipo sanguíneo e sem identificador da conta.
  async mural(uf?: string) {
    const pessoas = await this.db
      .select({ id: m.user_id, nome: m.nome_exibido, mostrarCidade: m.mostrar_cidade, sexo: schema.doador.sexo, cidade: schema.city.name, uf: schema.state.state })
      .from(m)
      .innerJoin(schema.user, eq(schema.user.id, m.user_id))
      .innerJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
      .leftJoin(schema.doador, eq(schema.doador.user_id, m.user_id))
      .leftJoin(schema.city, eq(schema.city.id, schema.profile.city))
      .leftJoin(schema.state, eq(schema.state.id, schema.profile.state));
    if (!pessoas.length) return [];
    const aprovadas = await this.db.select({ id: r.user_id, data: r.data }).from(r).where(and(eq(r.situacao, 'aprovado'), inArray(r.user_id, pessoas.map((p) => p.id))));
    const porPessoa = new Map<number, number[]>();
    for (const a of aprovadas) porPessoa.set(a.id, [...(porPessoa.get(a.id) ?? []), a.data]);
    return pessoas
      .map((p) => ({ nome: p.nome, cidade: p.mostrarCidade ? p.cidade : null, uf: p.mostrarCidade ? p.uf : null, doacoes: contarValidas(porPessoa.get(p.id) ?? [], p.sexo) }))
      .filter((p) => p.doacoes > 0 && (!uf || p.uf === uf))
      .sort((a, b) => b.doacoes - a.doacoes || a.nome.localeCompare(b.nome))
      .slice(0, 100)
      .map((p) => ({ ...p, marco: marcoDe(p.doacoes) }));
  }

  async meuMural(usuario: number) {
    const [linha] = await this.db.select().from(m).where(eq(m.user_id, usuario));
    return linha ?? null;
  }

  async entrarNoMural(usuario: number, d: MuralDto) {
    const valores = { nome_exibido: d.nome_exibido.trim(), mostrar_cidade: d.mostrar_cidade ? 1 : 0 };
    await this.db.insert(m).values({ user_id: usuario, ...valores, aceito_em: agora() }).onDuplicateKeyUpdate({ set: valores });
    return this.meuMural(usuario);
  }

  async sairDoMural(usuario: number) {
    await this.db.delete(m).where(eq(m.user_id, usuario));
    return { ok: true };
  }

  todosNoMural() {
    return this.db.select({ user_id: m.user_id, nome_exibido: m.nome_exibido, aceito_em: m.aceito_em, email: schema.user.email }).from(m).innerJoin(schema.user, eq(schema.user.id, m.user_id));
  }

  async mapa(tipo?: string) {
    const momento = agora();
    const [perfis, registros, doadores] = await Promise.all([
      this.db
        .select({ id: schema.user.id, tipo: schema.profile.bloodtype, cidadeId: schema.city.id, cidade: schema.city.name, uf: schema.state.state, lat: schema.cidadeCoordenada.latitude, lon: schema.cidadeCoordenada.longitude })
        .from(schema.user)
        .innerJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
        .leftJoin(schema.city, eq(schema.city.id, schema.profile.city))
        .leftJoin(schema.state, eq(schema.state.id, schema.city.state))
        .leftJoin(schema.cidadeCoordenada, eq(schema.cidadeCoordenada.city_id, schema.city.id)),
      this.db.select({ id: r.user_id, data: r.data }).from(r).where(ne(r.situacao, 'recusado')),
      this.db.select({ id: schema.doador.user_id, sexo: schema.doador.sexo }).from(schema.doador),
    ]);

    const sexoDe = new Map(doadores.map((x) => [x.id, x.sexo]));
    const datas = new Map<number, number[]>();
    for (const x of registros) datas.set(x.id, [...(datas.get(x.id) ?? []), x.data]);

    const situacao = { aptos: 0, emIntervalo: 0, inativos: 0 };
    const porTipo: Record<string, number> = {};
    let total = 0, primeiraVez = 0, regulares = 0, baseRetorno = 0, retornaram = 0;
    const cidades = new Map<number, { cidade: string; uf: string; lat: number; lon: number; pessoas: number; doadores: number }>();

    for (const p of perfis) {
      if (tipo && p.tipo !== tipo) continue;
      const lista = (datas.get(p.id) ?? []).slice().sort((a, b) => a - b);
      if (p.cidadeId && p.lat !== null) {
        const c = cidades.get(p.cidadeId) ?? { cidade: p.cidade, uf: p.uf, lat: p.lat, lon: p.lon, pessoas: 0, doadores: 0 };
        c.pessoas += 1;
        if (lista.length) c.doadores += 1;
        cidades.set(p.cidadeId, c);
      }
      if (!lista.length) continue;
      total += 1;
      if (p.tipo) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1;
      const ultima = lista[lista.length - 1];
      if (ultima < momento - ANO) situacao.inativos += 1;
      else if (momento >= ultima + intervaloDe(sexoDe.get(p.id)) * DIA) situacao.aptos += 1;
      else situacao.emIntervalo += 1;
      if (lista.length === 1) primeiraVez += 1;
      if (lista.filter((d) => d > momento - ANO).length >= 2) regulares += 1;
      if (lista[0] < momento - ANO) {
        baseRetorno += 1;
        if (lista[1] && lista[1] - lista[0] <= ANO) retornaram += 1;
      }
    }

    return {
      total, ...situacao, primeiraVez, regulares,
      retorno12m: baseRetorno ? Math.round((retornaram / baseRetorno) * 100) : null,
      porTipo,
      cidades: [...cidades.values()]
        .filter((c) => c.pessoas >= GRUPO_MINIMO)
        .map((c) => ({ ...c, doadores: c.doadores >= GRUPO_MINIMO ? c.doadores : null }))
        .sort((a, b) => b.pessoas - a.pessoas),
    };
  }
}

@ApiTags('registro')
@ApiBearerAuth()
@Controller()
class RegistroController {
  constructor(private readonly registros: RegistroService) {}

  @Post('registros') registrar(@CurrentUser() eu: AuthUser, @Body() d: RegistroDto) { return this.registros.registrar(eu.id, d); }
  @Delete('registros/:id') apagar(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.registros.apagar(id, eu.id); }

  @SkipAuth() @Get('mural') mural(@Query('uf') uf?: string) { return this.registros.mural(uf); }
  @Get('mural/me') meu(@CurrentUser() eu: AuthUser) { return this.registros.meuMural(eu.id); }
  @Put('mural/me') entrar(@CurrentUser() eu: AuthUser, @Body() d: MuralDto) { return this.registros.entrarNoMural(eu.id, d); }
  @Delete('mural/me') sair(@CurrentUser() eu: AuthUser) { return this.registros.sairDoMural(eu.id); }

  @AdminOnly() @Get('admin/mapa') mapa(@Query() q: MapaQuery) { return this.registros.mapa(q.tipo); }
  @AdminOnly() @Get('admin/mural') todos() { return this.registros.todosNoMural(); }
  @AdminOnly() @Delete('admin/mural/:id') remover(@Param('id', ParseIntPipe) id: number) { return this.registros.sairDoMural(id); }
}

@Module({ controllers: [RegistroController], providers: [RegistroService] })
export class RegistroModule {}
