import { Body, Controller, Delete, Get, Inject, Injectable, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Equals, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import { contarValidas, marcoDe, proximoMarco } from '../pulso/regras';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { agora } from '../common/agora';
import { nomePublico } from '../common/nome';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

export const INTERVALO_DIAS: Record<string, number> = { m: 60, f: 90 };

class DoadorDto {
  @Equals(true, { message: 'É preciso autorizar o uso destes dados.' }) consentimento: boolean;
  @IsOptional() @IsIn(['m', 'f']) sexo?: string;
  @IsInt() @Min(1) @Max(500) raio_km: number;
  @IsBoolean() aceita_alertas: boolean;
}

const p = schema.doador;
const d = schema.doacao;

@Injectable()
class DoadorService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  private async perfil(usuario: number) {
    const [linha] = await this.db.select().from(p).where(eq(p.user_id, usuario));
    return linha ?? null;
  }

  async jornada(usuario: number) {
    const r = schema.registroDoacao;
    const c = schema.campaign;
    const pv = schema.pedidoPrivacidade;
    const [doador, registros, compromissos] = await Promise.all([
      this.perfil(usuario),
      this.db
        .select({
          id: r.id, data: r.data, situacao: r.situacao, origem: r.origem, campaign_id: r.campaign_id,
          hemocentro: schema.bloodcenter.name, nome: c.name, so_primeiro: pv.so_primeiro_nome, bloodtype: c.bloodtype, image: c.image,
        })
        .from(r)
        .leftJoin(c, eq(c.id, r.campaign_id))
        .leftJoin(pv, eq(pv.campaign_id, c.id))
        .leftJoin(schema.bloodcenter, eq(schema.bloodcenter.id, r.bloodcenter_id))
        .where(eq(r.user_id, usuario))
        .orderBy(desc(r.data)),
      this.db
        .select({ campaign_id: d.campaign_id, updated_at: d.updated_at, nome: c.name, so_primeiro: pv.so_primeiro_nome, bloodtype: c.bloodtype, image: c.image })
        .from(d)
        .innerJoin(c, eq(c.id, d.campaign_id))
        .leftJoin(pv, eq(pv.campaign_id, c.id))
        .where(and(eq(d.user_id, usuario), eq(d.situacao, 'vou_doar')))
        .orderBy(desc(d.updated_at)),
    ]);
    const visivel = <T extends { nome: string | null; so_primeiro: number | null }>({ nome, so_primeiro, ...x }: T) => ({ ...x, nome: nome ? nomePublico(nome, so_primeiro) : null });
    const validas = registros.filter((x) => x.situacao !== 'recusado');
    const ultima = validas.length ? Math.max(...validas.map((x) => x.data)) : null;
    const intervalo = doador?.sexo ? INTERVALO_DIAS[doador.sexo] : null;
    const confirmadas = contarValidas(validas.filter((x) => x.situacao === 'aprovado').map((x) => x.data), doador?.sexo);
    return {
      doador, registros: registros.map(visivel), compromissos: compromissos.map(visivel),
      ultima, intervalo, proxima: ultima && intervalo ? ultima + intervalo * 86400 : null,
      doou: validas.length, confirmadas, marco: marcoDe(confirmadas), proximoMarco: proximoMarco(confirmadas),
    };
  }

  async salvar(usuario: number, dados: DoadorDto) {
    const momento = agora();
    const valores = { sexo: dados.sexo ?? null, raio_km: dados.raio_km, aceita_alertas: dados.aceita_alertas ? 1 : 0, updated_at: momento };
    await this.db.insert(p).values({ ...valores, user_id: usuario, lgpd_aceite_em: momento }).onDuplicateKeyUpdate({ set: valores });
    return this.perfil(usuario);
  }

  async revogar(usuario: number) {
    await this.db.delete(p).where(eq(p.user_id, usuario));
    return { ok: true };
  }
}

@ApiTags('doador')
@ApiBearerAuth()
@Controller('doador')
class DoadorController {
  constructor(private readonly doador: DoadorService) {}

  @Get('jornada') jornada(@CurrentUser() eu: AuthUser) { return this.doador.jornada(eu.id); }
  @Put('me') salvar(@CurrentUser() eu: AuthUser, @Body() d: DoadorDto) { return this.doador.salvar(eu.id, d); }
  @Delete('me') revogar(@CurrentUser() eu: AuthUser) { return this.doador.revogar(eu.id); }
}

@Module({ controllers: [DoadorController], providers: [DoadorService] })
export class DoadorModule {}
