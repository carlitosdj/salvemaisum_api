import { Body, Controller, Get, Ip, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { LimiteTentativas } from '../common/limite';
import { RegisterDto, UpdateMeDto } from './user.dto';
import { UserService } from './user.service';

const limiteCadastro = new LimiteTentativas(10, 60 * 60 * 1000);

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @SkipAuth()
  @Post()
  cadastrar(@Body() dados: RegisterDto, @Ip() ip: string) {
    limiteCadastro.verificar(ip);
    return this.users.cadastrar(dados, ip);
  }

  @Put('me')
  atualizar(@CurrentUser() eu: AuthUser, @Body() dados: UpdateMeDto) {
    return this.users.atualizarPerfil(eu.id, dados);
  }

  @SkipAuth()
  @Get(':id')
  perfil(@Param('id', ParseIntPipe) id: number) {
    return this.users.perfilPublico(id);
  }
}
