import { Controller, Get, Module } from '@nestjs/common';
import { SkipAuth } from '../auth/auth.decorators';

@Controller()
class HealthController {
  @SkipAuth()
  @Get(['', 'health'])
  health() {
    return { status: 'ok', servico: 'Salve Mais Um API' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
