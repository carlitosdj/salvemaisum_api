import * as crypto from 'crypto';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET não definido no ambiente');
}

export const jwtConstants = { secret: process.env.JWT_SECRET };

// Vai no token: trocar a senha encerra as sessões abertas, sem coluna nova no banco.
export const versaoSenha = (passwordHash: string) =>
  crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 12);
