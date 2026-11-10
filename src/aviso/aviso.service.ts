import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as webpush from 'web-push';
import { agora } from '../common/agora';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

// Só serviços de push dos navegadores: o endereço vem do cliente e a API faz a requisição.
const SERVICOS_PUSH = /^https:\/\/([a-z0-9.-]+\.)?(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com|mozaws\.net)\//i;

class ChavesDto {
  @IsString() @MaxLength(200) p256dh: string;
  @IsString() @MaxLength(100) auth: string;
}

export class InscricaoDto {
  @IsString() @MaxLength(2048) endpoint: string;
  @ValidateNested() @Type(() => ChavesDto) keys: ChavesDto;
  @IsOptional() @IsString() @MaxLength(255) dispositivo?: string;
  @IsOptional() @IsBoolean() instalado?: boolean;
}

export class RemoverDto {
  @IsString() @MaxLength(2048) endpoint: string;
}

export interface Aviso { titulo: string; corpo: string; url: string; tag?: string }

const p = schema.pushInscricao;
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

@Injectable()
export class AvisoService {
  private readonly logger = new Logger('Avisos');

  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {
    const { VAPID_PUBLIC_KEY: publica, VAPID_PRIVATE_KEY: privada, VAPID_SUBJECT: assunto } = process.env;
    if (publica && privada && assunto) webpush.setVapidDetails(assunto, publica, privada);
  }

  get ligado() {
    return !!process.env.VAPID_PRIVATE_KEY;
  }

  async inscrever(usuario: number, d: InscricaoDto) {
    if (!SERVICOS_PUSH.test(d.endpoint)) throw new BadRequestException('Serviço de notificação não reconhecido.');
    const valores = { user_id: usuario, p256dh: d.keys.p256dh, auth: d.keys.auth, dispositivo: d.dispositivo, instalado: d.instalado ? 1 : 0 };
    await this.db
      .insert(p)
      .values({ ...valores, endpoint_hash: hash(d.endpoint), endpoint: d.endpoint, created_at: agora() })
      .onDuplicateKeyUpdate({ set: valores });
    return { ok: true };
  }

  async remover(endpoint: string) {
    await this.db.delete(p).where(eq(p.endpoint_hash, hash(endpoint)));
    return { ok: true };
  }

  // Devolve em quantos aparelhos entregou. Inscrição expirada é apagada.
  async enviar(usuario: number, aviso: Aviso) {
    if (!this.ligado) return 0;
    const inscricoes = await this.db.select().from(p).where(eq(p.user_id, usuario));
    const envios = await Promise.all(inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(aviso));
        return 1;
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.db.delete(p).where(eq(p.id, i.id));
        else this.logger.warn(`Falha ao enviar aviso: ${status ?? (erro as Error).message}`);
        return 0;
      }
    }));
    return envios.reduce<number>((a, b) => a + b, 0);
  }
}
