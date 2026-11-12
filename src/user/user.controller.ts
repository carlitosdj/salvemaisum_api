import { Body, Controller, Get, Ip, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { LimiteTentativas } from '../common/limite';
import { RegisterDto, TrocarSenhaDto, UpdateMeDto } from './user.dto';
import { AuthService } from '../auth/auth.service';
import { UserService } from './user.service';

const limiteCadastro = new LimiteTentativas(10, 60 * 60 * 1000);
const limiteSenha = new LimiteTentativas(10, 15 * 60 * 1000);
const limiteLink = new LimiteTentativas(5, 60 * 60 * 1000);

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly auth: AuthService,
  ) {}

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

  @Put('me/senha')
  trocarSenha(@CurrentUser() eu: AuthUser, @Body() dados: TrocarSenhaDto) {
    limiteSenha.verificar(`senha-${eu.id}`);
    return this.users.trocarSenha(eu.id, dados);
  }

  // Link para criar senha nova no e-mail da própria conta (serve para quem entrou com rede social)
  @Post('me/link-senha')
  async linkSenha(@CurrentUser() eu: AuthUser) {
    limiteLink.verificar(`link-${eu.id}`);
    await this.auth.pedirRecuperacao(eu.email);
    return { enviado: true, email: eu.email };
  }

  @SkipAuth()
  @Get(':id')
  perfil(@Param('id', ParseIntPipe) id: number) {
    return this.users.perfilPublico(id);
  }
}
