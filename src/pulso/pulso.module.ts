import {
  BadRequestException, Body, Controller, Delete, Get, Module, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Response } from 'express';
import { AdminOnly, AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { AvisoModule } from '../aviso/aviso.module';
import { CampaignModule } from '../campaign/campaign.module';
import { PulsoService } from './pulso.service';

class ConviteDto { @IsInt() @Type(() => Number) codigo: number; }
class AgradecimentoDto { @IsString() @Length(3, 500, { message: 'Escreva entre 3 e 500 caracteres.' }) mensagem: string; }
class RevisaoDto { @IsIn(['aprovado', 'recusado']) situacao: 'aprovado' | 'recusado'; }
class OcultoDto { @IsBoolean() oculto: boolean; }
class TimeDto {
  @IsString() @MinLength(3) @MaxLength(80) nome: string;
  @IsIn(['empresa', 'faculdade', 'torcida', 'igreja', 'academia', 'amigos']) tipo: string;
  @IsOptional() @IsInt() @Type(() => Number) cidade?: number;
}

const IMAGENS = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('pulso')
@ApiBearerAuth()
@Controller()
class PulsoController {
  constructor(private readonly pulso: PulsoService) {}

  @Get('pulso') meu(@CurrentUser() eu: AuthUser) { return this.pulso.pulso(eu.id); }
  @Post('pulso/convite') convite(@CurrentUser() eu: AuthUser, @Body() d: ConviteDto) { return this.pulso.aceitarConvite(eu.id, d.codigo); }

  @SkipAuth() @Get('campaign/:id/agradecimentos')
  agradecimentos(@Param('id', ParseIntPipe) id: number) { return this.pulso.listarAgradecimentos(id); }

  @Post('campaign/:id/agradecimentos')
  agradecer(@Param('id', ParseIntPipe) id: number, @Body() d: AgradecimentoDto, @CurrentUser() eu: AuthUser) { return this.pulso.agradecer(id, d.mensagem.trim(), eu); }

  @Post('registros/:id/comprovante')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_r, f, cb) => cb(null, IMAGENS.includes(f.mimetype)) }))
  comprovante(@Param('id', ParseIntPipe) id: number, @UploadedFile() arquivo: Express.Multer.File | undefined, @CurrentUser() eu: AuthUser) {
    if (!arquivo) throw new BadRequestException('Envie uma imagem JPG, PNG ou WEBP.');
    return this.pulso.enviarComprovante(id, eu.id, arquivo.buffer);
  }

  @SkipAuth() @Get('ranking/cidades') cidades() { return this.pulso.cidades(); }
  @SkipAuth() @Get('times') times() { return this.pulso.times(); }
  @Post('times') criarTime(@Body() d: TimeDto, @CurrentUser() eu: AuthUser) { return this.pulso.criarTime(d, eu.id); }
  @Post('times/sair') sair(@CurrentUser() eu: AuthUser) { return this.pulso.sairDoTime(eu.id); }
  @Post('times/:id/entrar') entrar(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.pulso.entrarNoTime(id, eu.id); }

  @AdminOnly() @Get('admin/comprovantes') comprovantes(@Query('situacao') s = 'pendente') { return this.pulso.listarComprovantes(s); }
  @AdminOnly() @Get('admin/comprovantes/:id/arquivo')
  async arquivo(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(await this.pulso.caminhoComprovante(id), { dotfiles: 'deny' });
  }
  @AdminOnly() @Patch('admin/comprovantes/:id')
  revisar(@Param('id', ParseIntPipe) id: number, @Body() d: RevisaoDto, @CurrentUser() eu: AuthUser) { return this.pulso.revisarComprovante(id, d.situacao, eu); }

  @AdminOnly() @Get('admin/agradecimentos') todos() { return this.pulso.todosAgradecimentos(); }
  @AdminOnly() @Patch('admin/agradecimentos/:id') ocultar(@Param('id', ParseIntPipe) id: number, @Body() d: OcultoDto) { return this.pulso.ocultarAgradecimento(id, d.oculto); }
  @AdminOnly() @Delete('admin/times/:id') removerTime(@Param('id', ParseIntPipe) id: number) { return this.pulso.removerTime(id); }
}

@Module({ imports: [CampaignModule, AvisoModule], controllers: [PulsoController], providers: [PulsoService] })
export class PulsoModule {}
