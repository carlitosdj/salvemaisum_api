import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { IS_ADMIN_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { jwtConstants, versaoSenha } from './auth.constants';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(DB_SERVICE) private readonly db: DbType,
  ) {}

  async canActivate(context: ExecutionContext) {
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) return true;

    const request = context.switchToHttp().getRequest();
    const [tipo, token] = (request.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Sessão inválida.');

    let payload: { id: number; pv: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: jwtConstants.secret });
    } catch {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const [usuario] = await this.db.select().from(schema.user).where(eq(schema.user.id, payload.id));
    if (!usuario || usuario.blocked_at || payload.pv !== versaoSenha(usuario.password_hash)) {
      throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
    }

    request.user = { id: usuario.id, email: usuario.email, admin: usuario.flags === 1 };
    if (this.reflector.getAllAndOverride<boolean>(IS_ADMIN_KEY, alvos) && !request.user.admin) {
      throw new ForbiddenException('Acesso negado.');
    }
    return true;
  }
}
