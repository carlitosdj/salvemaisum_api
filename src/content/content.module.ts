import { BadRequestException, Body, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AdminOnly, SkipAuth } from '../auth/auth.decorators';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

const c = schema.component;
const x = schema.componentExtra;

export class ComponentDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Type(() => Number) status?: number;
  @IsOptional() @IsInt() @Type(() => Number) order?: number;
  @IsOptional() @IsString() @MaxLength(255) tags?: string;
  @IsOptional() @IsInt() @Type(() => Number) component_id?: number;
  // Campos soltos do item (foto, cargo, links, dados bancários). Valor vazio apaga o campo.
  @IsOptional() @IsObject() extras?: Record<string, string>;
}

function validarExtras(extras?: Record<string, string>) {
  if (!extras) return;
  const chaves = Object.keys(extras);
  if (chaves.length > 30) throw new BadRequestException('Campos demais.');
  for (const k of chaves) {
    if (!/^[a-z_]{1,40}$/.test(k)) throw new BadRequestException(`Campo inválido: ${k}`);
    if (typeof extras[k] !== 'string' || extras[k].length > 5000) throw new BadRequestException(`Valor inválido em ${k}`);
  }
}

@Injectable()
class ContentService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  listar() {
    return this.db.select().from(c).orderBy(asc(c.id));
  }

  async um(id: number) {
    const item = await this.db.query.component.findFirst({
      where: eq(c.id, id),
      with: { parent: true, extras: true, children: { with: { extras: true }, orderBy: [asc(c.order), asc(c.id)] } },
    });
    if (!item) throw new NotFoundException('Conteúdo inexistente');
    return item;
  }

  async criar({ extras, ...dados }: ComponentDto) {
    validarExtras(extras);
    const [novo] = await this.db.insert(c).values({ status: 1, order: 0, ...dados, created_at: Date.now() / 1000 }).$returningId();
    await this.gravarExtras(novo.id, extras);
    return this.um(novo.id);
  }

  async atualizar(id: number, { extras, ...dados }: ComponentDto) {
    validarExtras(extras);
    await this.um(id);
    if (Object.keys(dados).length) await this.db.update(c).set(dados).where(eq(c.id, id));
    await this.gravarExtras(id, extras);
    return this.um(id);
  }

  // Apaga os itens filhos e os campos antes, para não depender do ON DELETE do banco
  async remover(id: number) {
    await this.um(id);
    const filhos = (await this.db.select({ id: c.id }).from(c).where(eq(c.component_id, id))).map((f) => f.id);
    const ids = [id, ...filhos];
    await this.db.transaction(async (tx) => {
      await tx.delete(x).where(inArray(x.component_id, ids));
      if (filhos.length) await tx.delete(c).where(inArray(c.id, filhos));
      await tx.delete(c).where(eq(c.id, id));
    });
    return id;
  }

  private async gravarExtras(id: number, extras?: Record<string, string>) {
    if (!extras) return;
    for (const [chave, valor] of Object.entries(extras)) {
      const onde = and(eq(x.component_id, id), eq(x.key_extra, chave));
      const limpo = valor.trim();
      if (!limpo) { await this.db.delete(x).where(onde); continue; }
      const [existe] = await this.db.select({ id: x.id }).from(x).where(onde).limit(1);
      if (existe) await this.db.update(x).set({ value_extra: limpo }).where(eq(x.id, existe.id));
      else await this.db.insert(x).values({ component_id: id, key_extra: chave, value_extra: limpo, status: 1, created_at: Date.now() / 1000 });
    }
  }
}

// Campos privado_* (convite e relatório dos times de empresa) nunca saem pela rota pública
type ComExtras = { extras?: { key_extra: string | null }[]; children?: ComExtras[] };
function semPrivados<T extends ComExtras>(item: T): T {
  return {
    ...item,
    extras: item.extras?.filter((e) => !e.key_extra?.startsWith('privado_')),
    children: item.children?.map((f) => semPrivados(f)),
  };
}

@ApiTags('conteudos')
@ApiBearerAuth()
@Controller('components')
class ContentController {
  constructor(private readonly content: ContentService) {}

  @AdminOnly() @Get() listar() { return this.content.listar(); }
  @SkipAuth() @Get(':id') async um(@Param('id', ParseIntPipe) id: number) { return semPrivados(await this.content.um(id)); }
  @AdminOnly() @Post() criar(@Body() d: ComponentDto) { return this.content.criar(d); }
  @AdminOnly() @Put(':id') atualizar(@Param('id', ParseIntPipe) id: number, @Body() d: ComponentDto) { return this.content.atualizar(id, d); }
  @AdminOnly() @Delete(':id') remover(@Param('id', ParseIntPipe) id: number) { return this.content.remover(id); }
}

@Module({ controllers: [ContentController], providers: [ContentService] })
export class ContentModule {}
