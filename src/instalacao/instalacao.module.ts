import { Body, Controller, Get, Inject, Injectable, Ip, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { AdminOnly, AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { agora } from '../common/agora';
import { LimiteTentativas } from '../common/limite';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

// Instalações do app: o aparelho guarda um id próprio; a instalação é avisada pelo navegador (Android, computador)
// ou contada na primeira abertura pela tela inicial (iPhone, que não avisa). Desinstalar nenhum navegador avisa.
const i = schema.appInstalacao;
const limite = new LimiteTentativas(30, 60 * 60 * 1000);
const DIA = 86400;

class InstalacaoDto {
  @IsString() @Matches(/^[a-zA-Z0-9-]{16,64}$/) aparelho_id: string;
  @IsIn(['evento', 'abertura']) tipo: 'evento' | 'abertura';
  @IsOptional() @IsString() @MaxLength(20) plataforma?: string;
  @IsOptional() @IsString() @MaxLength(40) navegador?: string;
  @IsOptional() @IsString() @MaxLength(120) modelo?: string;
  @IsOptional() @IsString() @MaxLength(40) versao_sistema?: string;
}
class VincularDto { @IsString() @Matches(/^[a-zA-Z0-9-]{16,64}$/) aparelho_id: string; }

@Injectable()
class InstalacaoService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  async registrar(d: InstalacaoDto) {
    const t = agora();
    const [ja] = await this.db.select({ id: i.id }).from(i).where(eq(i.aparelho_id, d.aparelho_id)).limit(1);
    const info = { plataforma: d.plataforma?.slice(0, 20) || null, navegador: d.navegador?.slice(0, 40) || null, modelo: d.modelo?.slice(0, 120) || null, versao_sistema: d.versao_sistema?.slice(0, 40) || null };
    if (ja) {
      await this.db.update(i).set({
        ...Object.fromEntries(Object.entries(info).filter(([, v]) => v)),
        ...(d.tipo === 'abertura' ? { aberturas: sql`${i.aberturas} + 1`, ultimo_uso_em: t } : {}),
        updated_at: t,
      }).where(eq(i.id, ja.id));
    } else {
      await this.db.insert(i).values({
        aparelho_id: d.aparelho_id, ...info, origem: d.tipo === 'evento' ? 'evento' : 'primeira_abertura',
        aberturas: d.tipo === 'abertura' ? 1 : 0, instalado_em: t, ultimo_uso_em: d.tipo === 'abertura' ? t : null, created_at: t, updated_at: t,
      });
    }
    return { ok: true };
  }

  async vincular(aparelho: string, usuario: number) {
    await this.db.update(i).set({ user_id: usuario, updated_at: agora() }).where(eq(i.aparelho_id, aparelho));
    return { ok: true };
  }

  async resumo(pagina: number) {
    const t = agora();
    const [tot] = await this.db.select({
      total: sql<number>`COUNT(*)`,
      ultimos30: sql<number>`SUM(${i.instalado_em} >= ${t - 30 * DIA})`,
      ativos30: sql<number>`SUM(${i.ultimo_uso_em} >= ${t - 30 * DIA})`,
      identificados: sql<number>`SUM(${i.user_id} IS NOT NULL)`,
    }).from(i);
    const porPlataforma = await this.db.select({ plataforma: i.plataforma, n: sql<number>`COUNT(*)` }).from(i).groupBy(i.plataforma).orderBy(desc(sql`COUNT(*)`));
    const porDia = await this.db.select({ dia: sql<string>`DATE(FROM_UNIXTIME(${i.instalado_em} - 3 * 3600))`, n: sql<number>`COUNT(*)` })
      .from(i).where(gte(i.instalado_em, t - 30 * DIA)).groupBy(sql`1`).orderBy(sql`1`);
    const lista = await this.db.select({
      id: i.id, plataforma: i.plataforma, navegador: i.navegador, modelo: i.modelo, versao_sistema: i.versao_sistema, origem: i.origem,
      aberturas: i.aberturas, instalado_em: i.instalado_em, ultimo_uso_em: i.ultimo_uso_em,
      user_id: i.user_id, nome: schema.profile.name, email: schema.user.email,
    }).from(i)
      .leftJoin(schema.user, eq(schema.user.id, i.user_id))
      .leftJoin(schema.profile, eq(schema.profile.user_id, schema.user.profileUserId))
      .orderBy(desc(i.instalado_em)).limit(100).offset((Math.max(1, pagina) - 1) * 100);
    const num = (v: unknown) => Number(v ?? 0);
    return {
      total: num(tot.total), ultimos30: num(tot.ultimos30), ativos30: num(tot.ativos30), identificados: num(tot.identificados),
      porPlataforma: porPlataforma.map((p) => ({ plataforma: p.plataforma ?? 'Não informado', n: num(p.n) })),
      porDia: porDia.map((d) => ({ dia: String(d.dia), n: num(d.n) })),
      lista,
    };
  }
}

@ApiTags('instalações do app')
@ApiBearerAuth()
@Controller()
class InstalacaoController {
  constructor(private readonly instalacoes: InstalacaoService) {}

  @SkipAuth() @Post('app/instalacao') registrar(@Body() d: InstalacaoDto, @Ip() ip: string) {
    limite.verificar(ip);
    return this.instalacoes.registrar(d);
  }
  @Post('app/instalacao/vincular') vincular(@Body() d: VincularDto, @CurrentUser() eu: AuthUser) { return this.instalacoes.vincular(d.aparelho_id, eu.id); }
  @AdminOnly() @Get('admin/instalacoes') resumo(@Query('pagina') p?: string) { return this.instalacoes.resumo(Number(p) || 1); }
}

@Module({ controllers: [InstalacaoController], providers: [InstalacaoService] })
export class InstalacaoModule {}
