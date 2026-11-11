import { Body, Controller, Delete, Get, Module, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AdminOnly, AuthUser, CurrentUser } from '../auth/auth.decorators';
import { NoticiaModule } from '../noticia/noticia.module';
import { AgenteService } from './agente.service';
import { CampanhasService } from './campanhas.service';
import { CHAVES_EDITORIAS, EDITORIAS } from './editorias';

class PautaDto {
  @IsString() @MaxLength(500) pauta: string;
  @IsOptional() @IsIn(['noticia', 'guia', 'qualquer']) tipo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) @Type(() => Number) quantidade?: number;
}

class BuscaCampanhasDto {
  @IsOptional() @IsString() @MaxLength(200) regiao?: string;
  @IsIn(['hemocentros', 'familias', 'ambos']) escopo: string;
}

class AprovarCampanhaDto {
  @IsString() @MaxLength(200) titulo: string;
  @IsOptional() @IsString() @MaxLength(3000) descricao?: string;
  @IsString() @MaxLength(10) inicio: string;
  @IsString() @MaxLength(10) fim: string;
  @IsOptional() @IsInt() @Type(() => Number) bloodcenter_id?: number;
  @IsOptional() @IsInt() @Type(() => Number) city_id?: number;
}

class SituacaoCampanhaDto {
  @IsIn(['nova', 'contatada', 'autorizada', 'descartada']) situacao: string;
  @IsOptional() @IsString() @MaxLength(2000) observacao?: string;
  @IsOptional() @IsInt() @Type(() => Number) campaign_id?: number;
}

class ConfigDto {
  @IsOptional() @IsNumber() @Min(0.1) @Max(1000) @Type(() => Number) limite_execucao_usd?: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(5000) @Type(() => Number) limite_mes_usd?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(20) @Type(() => Number) cotacao_dolar?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) @Type(() => Number) tamanho_fila?: number;
}

class TemaDto {
  @IsString() @MaxLength(120) nome: string;
  @IsIn(CHAVES_EDITORIAS) categoria: string;
  @IsOptional() @IsString() @MaxLength(1000) instrucao?: string;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

// Tudo do agente de notícias é só para o admin
@ApiTags('agente de notícias')
@ApiBearerAuth()
@Controller('admin/agente')
class AgenteController {
  constructor(private readonly agente: AgenteService, private readonly campanhas: CampanhasService) {}

  @AdminOnly() @Get() status() { return this.agente.status(); }
  @AdminOnly() @Get('editorias') editorias() { return EDITORIAS; }
  @AdminOnly() @Post('gerar') gerar(@CurrentUser() eu: AuthUser) { return this.agente.pedir({ pedido: 'fila' }, eu.id); }
  @AdminOnly() @Post('pauta') pauta(@Body() d: PautaDto, @CurrentUser() eu: AuthUser) { return this.agente.pedir({ pedido: 'pauta', pauta: d.pauta, pauta_tipo: d.tipo, quantidade: d.quantidade }, eu.id); }
  @AdminOnly() @Post('campanhas/buscar') buscarCampanhas(@Body() d: BuscaCampanhasDto, @CurrentUser() eu: AuthUser) { return this.agente.pedir({ pedido: 'campanhas', pauta: d.regiao, pauta_tipo: d.escopo }, eu.id); }
  @AdminOnly() @Get('campanhas/:tipo') campanhasLista(@Param('tipo') tipo: string, @Query('situacao') situacao?: string) { return this.campanhas.listar(tipo, situacao ?? ''); }
  @AdminOnly() @Post('campanhas/:id/aprovar') aprovar(@Param('id', ParseIntPipe) id: number, @Body() d: AprovarCampanhaDto, @CurrentUser() eu: AuthUser) { return this.campanhas.aprovar(id, d, eu.id); }
  @AdminOnly() @Put('campanhas/:id/situacao') situacaoCampanha(@Param('id', ParseIntPipe) id: number, @Body() d: SituacaoCampanhaDto, @CurrentUser() eu: AuthUser) { return this.campanhas.mudar(id, d, eu.id); }
  @AdminOnly() @Get('execucoes/:id') execucao(@Param('id', ParseIntPipe) id: number) { return this.agente.execucao(id); }
  @AdminOnly() @Post('execucoes/:id/parar') parar(@Param('id', ParseIntPipe) id: number) { return this.agente.parar(id); }
  @AdminOnly() @Put('config') config(@Body() d: ConfigDto) { return this.agente.salvarConfig(d); }
  @AdminOnly() @Get('temas') temas() { return this.agente.listarTemas(); }
  @AdminOnly() @Post('temas') criarTema(@Body() d: TemaDto) { return this.agente.salvarTema(null, d); }
  @AdminOnly() @Put('temas/:id') salvarTema(@Param('id', ParseIntPipe) id: number, @Body() d: TemaDto) { return this.agente.salvarTema(id, d); }
  @AdminOnly() @Delete('temas/:id') removerTema(@Param('id', ParseIntPipe) id: number) { return this.agente.removerTema(id); }
}

@Module({ imports: [NoticiaModule], controllers: [AgenteController], providers: [AgenteService, CampanhasService], exports: [AgenteService] })
export class AgenteModule {}

// O worker sobe só com o serviço, sem as rotas
@Module({ imports: [NoticiaModule], providers: [AgenteService, CampanhasService], exports: [AgenteService] })
export class AgenteWorkerModule {}
