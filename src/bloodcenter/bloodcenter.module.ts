import { Body, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { asc, desc, eq, inArray, like, or } from 'drizzle-orm';
import { AdminOnly, SkipAuth } from '../auth/auth.decorators';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

const b = schema.bloodcenter;
const RELACOES = { cityParent: true, stateParent: true } as const;

export class BloodcenterDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(255) image?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(255) country?: string;
  @IsOptional() @IsString() @MaxLength(255) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) region?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsOptional() @IsInt() @Type(() => Number) status?: number;
  @IsOptional() @IsInt() @Type(() => Number) bccity?: number;
  @IsOptional() @IsInt() @Type(() => Number) bcstate?: number;
}

@Injectable()
class BloodcenterService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  listar() {
    return this.db.query.bloodcenter.findMany({ with: RELACOES, orderBy: asc(b.name) });
  }

  async buscar(termo: string) {
    const padrao = `%${termo}%`;
    const linhas = await this.db
      .select({ id: b.id })
      .from(b)
      .leftJoin(schema.city, eq(b.bccity, schema.city.id))
      .leftJoin(schema.state, eq(b.bcstate, schema.state.id))
      .where(or(like(b.name, padrao), like(schema.city.name, padrao), like(schema.state.name, padrao), like(schema.state.state, padrao)));
    if (!linhas.length) return [];
    return this.db.query.bloodcenter.findMany({ with: RELACOES, where: inArray(b.id, linhas.map((l) => l.id)), orderBy: desc(b.id) });
  }

  async um(id: number) {
    const item = await this.db.query.bloodcenter.findFirst({ with: RELACOES, where: eq(b.id, id) });
    if (!item) throw new NotFoundException('Hemocentro inexistente');
    return item;
  }

  async criar(dados: BloodcenterDto) {
    const [novo] = await this.db.insert(b).values(dados).$returningId();
    return this.um(novo.id);
  }

  async atualizar(id: number, dados: BloodcenterDto) {
    await this.um(id);
    if (Object.keys(dados).length) await this.db.update(b).set(dados).where(eq(b.id, id));
    return this.um(id);
  }

  async remover(id: number) {
    await this.um(id);
    await this.db.delete(b).where(eq(b.id, id));
    return id;
  }
}

@ApiTags('hemocentros')
@ApiBearerAuth()
@Controller()
class BloodcenterController {
  constructor(private readonly centers: BloodcenterService) {}

  @SkipAuth() @Get('bloodcenters') listar() { return this.centers.listar(); }
  @SkipAuth() @Get('searchbloodcenter/:search') buscar(@Param('search') t: string) { return this.centers.buscar(t); }
  @SkipAuth() @Get('bloodcenter/:id') um(@Param('id', ParseIntPipe) id: number) { return this.centers.um(id); }
  @AdminOnly() @Post('bloodcenter') criar(@Body() d: BloodcenterDto) { return this.centers.criar(d); }
  @AdminOnly() @Put('bloodcenter/:id') atualizar(@Param('id', ParseIntPipe) id: number, @Body() d: BloodcenterDto) { return this.centers.atualizar(id, d); }
  @AdminOnly() @Delete('bloodcenter/:id') remover(@Param('id', ParseIntPipe) id: number) { return this.centers.remover(id); }
}

@Module({ controllers: [BloodcenterController], providers: [BloodcenterService] })
export class BloodcenterModule {}
