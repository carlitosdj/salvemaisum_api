import { Body, Controller, Get, Module, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { AvisoService, InscricaoDto, RemoverDto } from './aviso.service';
import { LembreteService } from './lembrete.service';

@ApiTags('avisos')
@ApiBearerAuth()
@Controller('avisos')
class AvisoController {
  constructor(private readonly avisos: AvisoService) {}

  @SkipAuth()
  @Get('chave')
  chave() {
    return { chave: process.env.VAPID_PUBLIC_KEY ?? null };
  }

  @Post('push')
  inscrever(@CurrentUser() eu: AuthUser, @Body() d: InscricaoDto) {
    return this.avisos.inscrever(eu.id, d);
  }

  @Post('push/remover')
  remover(@Body() d: RemoverDto) {
    return this.avisos.remover(d.endpoint);
  }

  @Post('push/teste')
  async teste(@CurrentUser() eu: AuthUser) {
    if (!this.avisos.ligado) throw new ServiceUnavailableException('Notificações desligadas.');
    const entregues = await this.avisos.enviar(eu.id, { titulo: 'Salve Mais Um', corpo: 'Notificações ativadas neste aparelho.', url: '/', tag: 'teste' });
    return { entregues };
  }
}

@Module({ controllers: [AvisoController], providers: [AvisoService, LembreteService], exports: [AvisoService] })
export class AvisoModule {}
