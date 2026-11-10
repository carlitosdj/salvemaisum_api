import { BadRequestException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { EmailService } from '../email/email.service';
import { appUrl } from '../common/urls';
import { agora } from '../common/agora';
import { versaoSenha } from './auth.constants';
import { LoginDto, KeyDto, ResetDto } from './dto/auth.dto';

const COM_PERFIL = { profile: { with: { cityParent: true, stateParent: true } } } as const;

export function semSegredos<T extends Record<string, unknown>>(usuario: T) {
  const { password_hash, auth_key, registration_ip, unconfirmed_email, ...publico } = usuario;
  return publico;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  private async sessao(id: number, passwordHash: string) {
    await this.db.update(schema.user).set({ last_login_at: agora() }).where(eq(schema.user.id, id));
    return this.jwt.signAsync({ id, pv: versaoSenha(passwordHash) });
  }

  private async contaSocial(email: string, nome: string, foto?: string) {
    const existente = await this.db.query.user.findFirst({ where: eq(schema.user.email, email) });
    const senhaAleatoria = () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    if (!existente) {
      const senha = await senhaAleatoria();
      return this.db.transaction(async (tx) => {
        const [perfil] = await tx.insert(schema.profile).values({ name: nome.slice(0, 120), image: foto }).$returningId();
        await tx.insert(schema.user).values({
          username: email,
          email,
          password_hash: senha,
          auth_key: 'Confirmed',
          confirmed_at: agora(),
          created_at: agora(),
          profileUserId: perfil.user_id,
        });
      });
    }

    // Conta com e-mail nunca confirmado: alguém pode ter cadastrado o endereço de outra pessoa.
    // O provedor provou quem é o dono, então a senha definida antes da confirmação deixa de valer.
    if (!existente.confirmed_at) {
      await this.db
        .update(schema.user)
        .set({ password_hash: await senhaAleatoria(), auth_key: 'Confirmed', confirmed_at: agora() })
        .where(eq(schema.user.id, existente.id));
    }
  }

  async loginGoogle(credencial: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ServiceUnavailableException('Login com Google indisponível.');

    let dados;
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credencial, audience: clientId });
      dados = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Não foi possível confirmar sua conta Google.');
    }
    if (!dados?.email || !dados.email_verified) throw new UnauthorizedException('E-mail Google não verificado.');

    return this.entrarSocial(dados.email, dados.name, dados.picture);
  }

  private async entrarSocial(email: string, nome?: string, foto?: string) {
    await this.contaSocial(email, nome ?? email.split('@')[0], foto);
    const usuario = await this.db.query.user.findFirst({ where: eq(schema.user.email, email), with: COM_PERFIL });
    if (usuario.blocked_at) throw new UnauthorizedException('Conta bloqueada.');
    const access_token = await this.sessao(usuario.id, usuario.password_hash);
    return { ...semSegredos(usuario), access_token };
  }

  async loginFacebook(token: string) {
    const { FACEBOOK_APP_ID: appId, FACEBOOK_APP_SECRET: segredo } = process.env;
    if (!appId || !segredo) throw new ServiceUnavailableException('Login com Facebook indisponível.');
    const grafo = 'https://graph.facebook.com/v21.0';
    const consultar = async (url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      return (await r.json()) as Record<string, any>;
    };
    const parametros = new URLSearchParams({ input_token: token, access_token: `${appId}|${segredo}` });
    const conferido = await consultar(`${grafo}/debug_token?${parametros}`).catch(() => null);
    if (!conferido?.data?.is_valid || conferido.data.app_id !== appId) {
      throw new UnauthorizedException('Não foi possível confirmar sua conta Facebook.');
    }
    const eu = await consultar(`${grafo}/me?${new URLSearchParams({ fields: 'name,email,picture.width(400)', access_token: token })}`).catch(() => null);
    if (!eu?.email) throw new BadRequestException('Sua conta Facebook não informou e-mail. Entre com Google ou com seu e-mail.');
    return this.entrarSocial(eu.email, eu.name, eu.picture?.data?.url);
  }

  async login(dados: LoginDto, somenteAdmin: boolean) {
    const usuario = await this.db.query.user.findFirst({
      where: eq(schema.user.email, dados.email),
      with: COM_PERFIL,
    });
    const valido = usuario && !usuario.blocked_at && (await bcrypt.compare(dados.password, usuario.password_hash));
    if (!valido || (somenteAdmin && usuario.flags !== 1)) {
      throw new UnauthorizedException('Login/Senha inválidos');
    }
    const access_token = await this.sessao(usuario.id, usuario.password_hash);
    return { ...semSegredos(usuario), access_token };
  }

  async confirmar({ email, auth_key }: KeyDto | { email: string; auth_key: string }) {
    const [usuario] = await this.db.select().from(schema.user).where(eq(schema.user.email, email));
    if (!usuario) throw new BadRequestException('Usuário inexistente');
    if (usuario.auth_key === 'Confirmed') return 'Usuário já está confirmado.';
    if (usuario.auth_key !== auth_key) throw new BadRequestException('Chave inválida, repita o processo.');
    await this.db
      .update(schema.user)
      .set({ auth_key: 'Confirmed', confirmed_at: agora() })
      .where(eq(schema.user.id, usuario.id));
    return 'Usuário confirmado com sucesso.';
  }

  // Resposta igual exista ou não o e-mail: não revela quem tem conta.
  async pedirRecuperacao(email: string) {
    const [usuario] = await this.db.select().from(schema.user).where(eq(schema.user.email, email));
    if (usuario) {
      const chave = crypto.randomUUID();
      await this.db.update(schema.user).set({ auth_key: chave }).where(eq(schema.user.id, usuario.id));
      await this.email.enviar(
        usuario.email,
        'Recuperar senha - Salve mais um',
        this.email.botao(
          'Recuperar senha',
          'Use o botão abaixo para criar uma nova senha.',
          `${appUrl()}/auth/change/${encodeURIComponent(usuario.email)}/${chave}`,
          'Criar nova senha',
        ),
      );
    }
    return { msg: 'Ok!' };
  }

  private buscarPorChave(email: string, chave: string) {
    return this.db.query.user.findFirst({
      where: and(eq(schema.user.email, email), eq(schema.user.auth_key, chave)),
      with: COM_PERFIL,
    });
  }

  // O link do e-mail já traz a chave: devolvê-la aqui não expõe nada novo.
  async validarChave({ email, auth_key }: KeyDto) {
    const usuario = await this.buscarPorChave(email, auth_key);
    if (!usuario) throw new BadRequestException('Chave inválida');
    return { ...semSegredos(usuario), auth_key: usuario.auth_key };
  }

  async redefinirSenha({ email, auth_key, newPassword }: ResetDto) {
    const usuario = await this.buscarPorChave(email, auth_key);
    if (!usuario) throw new BadRequestException('Link de recuperação inválido ou expirado.');
    await this.db
      .update(schema.user)
      .set({
        password_hash: await bcrypt.hash(newPassword, 10),
        auth_key: 'Confirmed',
        confirmed_at: usuario.confirmed_at ?? agora(),
        updated_at: agora(),
      })
      .where(eq(schema.user.id, usuario.id));
    return semSegredos(usuario);
  }
}
