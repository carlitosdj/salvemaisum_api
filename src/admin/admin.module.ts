import { Body, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { and, count, desc, eq, inArray, isNotNull, like, or, SQL } from 'drizzle-orm';
import { AdminOnly, AuthUser, CurrentUser } from '../auth/auth.decorators';
import { AuthService, semSegredos } from '../auth/auth.service';
import { AuthModule } from '../auth/auth.module';
import { PerfilAdminDto } from '../user/user.dto';
import { agora } from '../common/agora';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { CampaignModule } from '../campaign/campaign.module';
import { CampaignService, STATUS_ATIVA } from '../campaign/campaign.service';

class PageQuery {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Type(() => Number) take?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsInt() @Type(() => Number) status?: number;
}

class BlockDto {
  @IsBoolean() blocked: boolean;
}

class StatusDto {
  @IsIn([0, 1]) status: number;
}

const u = schema.user;

@Injectable()
class AdminService {
  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly campaigns: CampaignService,
    private readonly auth: AuthService,
  ) {}

  async painel() {
    const contar = async (tabela: any, filtro?: SQL) => {
      const [{ total }] = await this.db.select({ total: count() }).from(tabela).where(filtro);
      return total;
    };
    const [usuarios, confirmados, campanhas, ativas, hemocentros, contatos] = await Promise.all([
      contar(u),
      contar(u, isNotNull(u.confirmed_at)),
      contar(schema.campaign),
      contar(schema.campaign, eq(schema.campaign.status, STATUS_ATIVA)),
      contar(schema.bloodcenter),
      contar(schema.contact),
    ]);
    return { usuarios, confirmados, campanhas, ativas, hemocentros, contatos };
  }

  async usuarios({ page = 1, take = 20, search }: PageQuery) {
    const limite = Math.min(Math.max(take, 1), 100);
    let filtro: SQL | undefined;
    if (search) {
      const padrao = `%${search}%`;
      const perfis = await this.db
        .select({ id: schema.profile.user_id })
        .from(schema.profile)
        .where(like(schema.profile.name, padrao));
      const ids = perfis.map((p) => p.id);
      filtro = or(like(u.email, padrao), ids.length ? inArray(u.profileUserId, ids) : undefined);
    }
    const [linhas, [{ total }]] = await Promise.all([
      this.db.query.user.findMany({
        where: filtro,
        with: { profile: { with: { cityParent: true, stateParent: true } } },
        orderBy: desc(u.id),
        limit: limite,
        offset: limite * (Math.max(page, 1) - 1),
      }),
      this.db.select({ total: count() }).from(u).where(filtro),
    ]);
    return { data: linhas.map(semSegredos), count: total };
  }

  async bloquear(id: number, bloqueado: boolean, eu: AuthUser) {
    if (id === eu.id) throw new BadRequestException('Você não pode bloquear a própria conta.');
    await this.existe(id);
    await this.db.update(u).set({ blocked_at: bloqueado ? agora() : null }).where(eq(u.id, id));
    return { id, blocked: bloqueado };
  }

  async editarUsuario(id: number, perfil: PerfilAdminDto) {
    const usuario = await this.existe(id);
    if (!usuario.profileUserId) throw new BadRequestException('Esta conta não tem perfil.');
    const dados = Object.fromEntries(Object.entries(perfil).filter(([, v]) => v !== undefined));
    if (Object.keys(dados).length) await this.db.update(schema.profile).set(dados).where(eq(schema.profile.user_id, usuario.profileUserId));
    await this.db.update(u).set({ updated_at: agora() }).where(eq(u.id, id));
    const atualizado = await this.db.query.user.findFirst({ where: eq(u.id, id), with: { profile: { with: { cityParent: true, stateParent: true } } } });
    return semSegredos(atualizado!);
  }

  // O adm nunca define nem vê a senha de ninguém: a pessoa recebe o link e cria a própria
  async linkSenha(id: number) {
    const usuario = await this.existe(id);
    await this.auth.pedirRecuperacao(usuario.email);
    return { enviado: true, email: usuario.email };
  }

  async removerUsuario(id: number, eu: AuthUser) {
    if (id === eu.id) throw new BadRequestException('Você não pode excluir a própria conta.');
    const usuario = await this.existe(id);
    await this.db.transaction(async (tx) => {
      await tx.delete(u).where(eq(u.id, id));
      if (usuario.profileUserId) await tx.delete(schema.profile).where(eq(schema.profile.user_id, usuario.profileUserId));
    });
    return id;
  }

  private async existe(id: number) {
    const [usuario] = await this.db.select().from(u).where(eq(u.id, id));
    if (!usuario) throw new NotFoundException('Usuário inexistente');
    return usuario;
  }

  async campanhas({ page = 1, take = 20, search, status }: PageQuery) {
    const porStatus = status === undefined ? undefined : eq(schema.campaign.status, status);
    if (!search) return this.campaigns.paginar(page, take, porStatus);
    const ids = await this.campaigns.idsDaBusca(search, porStatus);
    if (!ids.length) return { data: [], count: 0 };
    return this.campaigns.paginar(page, take, inArray(schema.campaign.id, ids));
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly campaigns: CampaignService,
  ) {}

  @Get('dashboard') painel() { return this.admin.painel(); }
  @Get('users') usuarios(@Query() q: PageQuery) { return this.admin.usuarios(q); }
  @Patch('users/:id/block') bloquear(@Param('id', ParseIntPipe) id: number, @Body() d: BlockDto, @CurrentUser() eu: AuthUser) { return this.admin.bloquear(id, d.blocked, eu); }
  @Put('users/:id') editar(@Param('id', ParseIntPipe) id: number, @Body() d: PerfilAdminDto) { return this.admin.editarUsuario(id, d); }
  @Post('users/:id/link-senha') linkSenha(@Param('id', ParseIntPipe) id: number) { return this.admin.linkSenha(id); }
  @Delete('users/:id') remover(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.admin.removerUsuario(id, eu); }
  @Get('campaigns') campanhas(@Query() q: PageQuery) { return this.admin.campanhas(q); }
  @Patch('campaigns/:id/status') status(@Param('id', ParseIntPipe) id: number, @Body() d: StatusDto) { return this.campaigns.alterarStatus(id, d.status); }
}

@Module({ imports: [CampaignModule, AuthModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
