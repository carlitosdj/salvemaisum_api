import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { EmailService } from '../email/email.service';
import { appUrl } from '../common/urls';
import { agora } from '../common/agora';
import { semSegredos } from '../auth/auth.service';
import { RegisterDto, UpdateMeDto } from './user.dto';

const COM_PERFIL = { profile: { with: { cityParent: true, stateParent: true } } } as const;

@Injectable()
export class UserService {
  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly email: EmailService,
  ) {}

  async cadastrar(dados: RegisterDto, ip: string) {
    const [existente] = await this.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, dados.email));
    if (existente) throw new ConflictException('User already exists');

    const chave = crypto.randomUUID();
    const senha = await bcrypt.hash(dados.password, 10);
    const id = await this.db.transaction(async (tx) => {
      const [perfil] = await tx.insert(schema.profile).values(dados.profile).$returningId();
      const [novo] = await tx
        .insert(schema.user)
        .values({
          username: dados.email,
          email: dados.email,
          password_hash: senha,
          auth_key: chave,
          registration_ip: ip,
          created_at: agora(),
          profileUserId: perfil.user_id,
        })
        .$returningId();
      return novo.id;
    });

    await this.email.enviar(
      dados.email,
      'Salve mais um - Confirme seu email',
      this.email.botao(
        'Bem-vindo ao Salve Mais Um',
        'Confirme seu e-mail para ativar a conta.',
        `${appUrl()}/auth/confirm/${encodeURIComponent(dados.email)}/${chave}`,
        'Confirmar e-mail',
      ),
    );
    return semSegredos(await this.buscar(id));
  }

  private async buscar(id: number) {
    const usuario = await this.db.query.user.findFirst({ where: eq(schema.user.id, id), with: COM_PERFIL });
    if (!usuario) throw new NotFoundException('Usuário inexistente');
    return usuario;
  }

  async perfilPublico(id: number) {
    const usuario = await this.buscar(id);
    return { id: usuario.id, profile: usuario.profile };
  }

  async atualizarPerfil(id: number, dados: UpdateMeDto) {
    const usuario = await this.buscar(id);
    if (Object.keys(dados.profile).length) {
      await this.db.update(schema.profile).set(dados.profile).where(eq(schema.profile.user_id, usuario.profileUserId));
    }
    await this.db.update(schema.user).set({ updated_at: agora() }).where(eq(schema.user.id, id));
    return semSegredos(await this.buscar(id));
  }
}
