import { Body, Controller, Ip, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LimiteTentativas } from '../common/limite';
import { SkipAuth } from './auth.decorators';
import { AuthService } from './auth.service';
import { FacebookDto, GoogleDto, KeyDto, LinkDto, LoginDto, RecoveryDto, ResetDto } from './dto/auth.dto';

const QUINZE_MIN = 15 * 60 * 1000;
const limiteLogin = new LimiteTentativas(10, QUINZE_MIN);
const limiteRecuperacao = new LimiteTentativas(5, QUINZE_MIN);
const limiteChave = new LimiteTentativas(20, QUINZE_MIN);

@ApiTags('auth')
@SkipAuth()
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dados: LoginDto, @Ip() ip: string) {
    limiteLogin.verificar(`${ip}:${dados.email.toLowerCase()}`);
    return this.auth.login(dados, false);
  }

  @Post('login/google')
  google(@Body() dados: GoogleDto, @Ip() ip: string) {
    limiteLogin.verificar(`${ip}:google`);
    return this.auth.loginGoogle(dados.credential);
  }

  @Post('login/facebook')
  facebook(@Body() dados: FacebookDto, @Ip() ip: string) {
    limiteLogin.verificar(`${ip}:facebook`);
    return this.auth.loginFacebook(dados.accessToken);
  }

  @Post('login/link')
  pedirLink(@Body() dados: RecoveryDto, @Ip() ip: string) {
    limiteRecuperacao.verificar(ip);
    return this.auth.pedirLink(dados.email);
  }

  @Post('login/link/entrar')
  entrarComLink(@Body() dados: LinkDto, @Ip() ip: string) {
    limiteChave.verificar(ip);
    return this.auth.entrarComLink(dados.token);
  }

  @Post('loginadm')
  loginAdm(@Body() dados: LoginDto, @Ip() ip: string) {
    limiteLogin.verificar(`${ip}:${dados.email.toLowerCase()}`);
    return this.auth.login(dados, true);
  }

  @Post('confirm')
  confirmar(@Body() dados: KeyDto, @Ip() ip: string) {
    limiteChave.verificar(ip);
    return this.auth.confirmar(dados);
  }

  @Post('recovery')
  recuperar(@Body() dados: RecoveryDto, @Ip() ip: string) {
    limiteRecuperacao.verificar(ip);
    return this.auth.pedirRecuperacao(dados.email);
  }

  @Post('userrecovery')
  validarChave(@Body() dados: KeyDto, @Ip() ip: string) {
    limiteChave.verificar(ip);
    return this.auth.validarChave(dados);
  }

  @Post('recovery/reset')
  redefinir(@Body() dados: ResetDto, @Ip() ip: string) {
    limiteChave.verificar(ip);
    return this.auth.redefinirSenha(dados);
  }
}
