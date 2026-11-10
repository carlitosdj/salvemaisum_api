import { Body, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { asc, eq } from 'drizzle-orm';
import { AdminOnly, SkipAuth } from '../auth/auth.decorators';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

const c = schema.component;

export class ComponentDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Type(() => Number) status?: number;
  @IsOptional() @IsInt() @Type(() => Number) order?: number;
  @IsOptional() @IsString() @MaxLength(255) tags?: string;
  @IsOptional() @IsInt() @Type(() => Number) component_id?: number;
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
      with: { parent: true, extras: true, children: { with: { extras: true }, orderBy: asc(c.order) } },
    });
    if (!item) throw new NotFoundException('Conteúdo inexistente');
    return item;
  }

  async criar(dados: ComponentDto) {
    const [novo] = await this.db.insert(c).values({ ...dados, created_at: Date.now() / 1000 }).$returningId();
    return this.um(novo.id);
  }

  async atualizar(id: number, dados: ComponentDto) {
    await this.um(id);
    if (Object.keys(dados).length) await this.db.update(c).set(dados).where(eq(c.id, id));
    return this.um(id);
  }

  async remover(id: number) {
    await this.um(id);
    await this.db.delete(c).where(eq(c.id, id));
    return id;
  }
}

@ApiTags('conteudos')
@ApiBearerAuth()
@Controller('components')
class ContentController {
  constructor(private readonly content: ContentService) {}

  @AdminOnly() @Get() listar() { return this.content.listar(); }
  @SkipAuth() @Get(':id') um(@Param('id', ParseIntPipe) id: number) { return this.content.um(id); }
  @AdminOnly() @Post() criar(@Body() d: ComponentDto) { return this.content.criar(d); }
  @AdminOnly() @Put(':id') atualizar(@Param('id', ParseIntPipe) id: number, @Body() d: ComponentDto) { return this.content.atualizar(id, d); }
  @AdminOnly() @Delete(':id') remover(@Param('id', ParseIntPipe) id: number) { return this.content.remover(id); }
}

@Module({ controllers: [ContentController], providers: [ContentService] })
export class ContentModule {}
