import { BadRequestException, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { AdminOnly, AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { agora } from '../common/agora';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { PulsoModule } from '../pulso/pulso.module';
import { PulsoService } from '../pulso/pulso.service';

// Times de empresa: o vínculo fica nos campos do parceiro (tabela component, filhos da página 18).
// time_id é público; privado_convite e privado_relatorio só saem por estas rotas.
export const PAGINA_PARCEIROS = 18;
const MINIMO_PARA_DETALHE = 5; // abaixo disso o relatório mostra só totais, para ninguém ser identificado
const x = schema.componentExtra;
const c = schema.component;

const codigo = () => crypto.randomBytes(9).toString('base64url');

interface Parceiro { id: number; nome: string; logo: string | null; time_id: number | null; convite: string | null; relatorio: string | null }

@Injectable()
class CorporativoService {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType, private readonly pulso: PulsoService) {}

  private async linhas<T>(consulta: ReturnType<typeof sql>) {
    return ((await this.db.execute(consulta)) as unknown as [T[]])[0];
  }

  private async parceiro(onde: ReturnType<typeof sql>) {
    const [p] = await this.linhas<Parceiro>(sql`
      SELECT c.id, c.name AS nome,
        MAX(CASE WHEN e.key_extra = 'logo' THEN e.value_extra END) AS logo,
        MAX(CASE WHEN e.key_extra = 'time_id' THEN e.value_extra END) AS time_id,
        MAX(CASE WHEN e.key_extra = 'privado_convite' THEN e.value_extra END) AS convite,
        MAX(CASE WHEN e.key_extra = 'privado_relatorio' THEN e.value_extra END) AS relatorio
      FROM component c JOIN component_extra e ON e.component_id = c.id
      WHERE c.component_id = ${PAGINA_PARCEIROS}
      GROUP BY c.id, c.name
      HAVING ${onde}
      LIMIT 1`);
    return p ? { ...p, time_id: p.time_id ? Number(p.time_id) : null } : null;
  }

  private porId(id: number) { return this.parceiro(sql`c.id = ${id}`); }
  private porConvite(cod: string) { return this.parceiro(sql`convite = ${cod}`); }
  private porRelatorio(cod: string) { return this.parceiro(sql`relatorio = ${cod}`); }

  private async gravar(id: number, chave: string, valor: string) {
    const onde = and(eq(x.component_id, id), eq(x.key_extra, chave));
    const [existe] = await this.db.select({ id: x.id }).from(x).where(onde).limit(1);
    if (existe) await this.db.update(x).set({ value_extra: valor }).where(eq(x.id, existe.id));
    else await this.db.insert(x).values({ component_id: id, key_extra: chave, value_extra: valor, status: 1, created_at: agora() });
  }

  private async membros(timeId: number) {
    const [r] = await this.linhas<{ n: number }>(sql`SELECT COUNT(*) AS n FROM time_membro WHERE time_id = ${timeId}`);
    return Number(r?.n ?? 0);
  }

  // ---------- adm ----------

  async situacao(id: number) {
    const p = await this.porId(id);
    if (!p) {
      const [existe] = await this.db.select({ id: c.id }).from(c).where(and(eq(c.id, id), eq(c.component_id, PAGINA_PARCEIROS)));
      if (!existe) throw new NotFoundException('Parceiro inexistente.');
      return { time_id: null };
    }
    if (!p.time_id) return { time_id: null };
    const [t] = await this.db.select({ nome: schema.time.nome }).from(schema.time).where(eq(schema.time.id, p.time_id));
    if (!t) return { time_id: null };
    return { time_id: p.time_id, nome: t.nome, membros: await this.membros(p.time_id), convite: p.convite, relatorio: p.relatorio };
  }

  async criarTime(id: number, admin: number) {
    const atual = await this.situacao(id);
    if (atual.time_id) return atual;
    const [parceiro] = await this.db.select({ nome: c.name }).from(c).where(eq(c.id, id));
    const [novo] = await this.db.insert(schema.time).values({ nome: (parceiro?.nome ?? 'Time da empresa').slice(0, 80), tipo: 'empresa', criado_por: admin, created_at: agora() }).$returningId();
    await this.gravar(id, 'time_id', String(novo.id));
    await this.novosLinks(id);
    return this.situacao(id);
  }

  // Invalida os links antigos (ex.: o link do relatório foi parar com quem não devia)
  async novosLinks(id: number) {
    await this.gravar(id, 'privado_convite', codigo());
    await this.gravar(id, 'privado_relatorio', codigo());
    return this.situacao(id);
  }

  // ---------- convite ----------

  async convite(cod: string) {
    const p = await this.porConvite(cod);
    if (!p?.time_id) throw new NotFoundException('Convite inválido ou expirado.');
    return { time_id: p.time_id, empresa: p.nome, logo: p.logo, membros: await this.membros(p.time_id) };
  }

  async entrar(cod: string, usuario: number) {
    const p = await this.porConvite(cod);
    if (!p?.time_id) throw new NotFoundException('Convite inválido ou expirado.');
    return this.pulso.entrarNoTime(p.time_id, usuario, true);
  }

  // ---------- relatório ----------

  async relatorio(cod: string) {
    const p = await this.porRelatorio(cod);
    if (!p?.time_id) throw new NotFoundException('Relatório não encontrado.');
    const [t] = await this.db.select().from(schema.time).where(eq(schema.time.id, p.time_id));
    if (!t) throw new NotFoundException('Relatório não encontrado.');
    // Só conta doações feitas depois que a pessoa entrou no time
    const doacoes = sql`FROM registro_doacao r JOIN time_membro m ON m.user_id = r.user_id AND m.time_id = ${t.id}
      WHERE r.situacao <> 'recusado' AND r.data >= m.created_at`;
    const [tot] = await this.linhas<{ informadas: number; confirmadas: number; doadores: number }>(sql`
      SELECT COUNT(*) AS informadas, SUM(r.situacao = 'aprovado') AS confirmadas, COUNT(DISTINCT r.user_id) AS doadores ${doacoes}`);
    const membros = await this.membros(t.id);
    const detalhe = membros >= MINIMO_PARA_DETALHE;
    const meses = detalhe
      ? await this.linhas<{ mes: string; doacoes: number }>(sql`
          SELECT DATE_FORMAT(FROM_UNIXTIME(r.data), '%Y-%m') AS mes, COUNT(*) AS doacoes ${doacoes}
            AND r.data >= UNIX_TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 12 MONTH))
          GROUP BY mes ORDER BY mes`)
      : [];
    return {
      empresa: p.nome,
      logo: p.logo,
      time: t.nome,
      desde: t.created_at,
      gerado_em: agora(),
      membros,
      informadas: Number(tot?.informadas ?? 0),
      confirmadas: Number(tot?.confirmadas ?? 0),
      doadores: detalhe ? Number(tot?.doadores ?? 0) : null,
      meses: meses.map((m) => ({ mes: m.mes, doacoes: Number(m.doacoes) })),
      minimo_detalhe: MINIMO_PARA_DETALHE,
    };
  }
}

@ApiTags('times de empresa')
@ApiBearerAuth()
@Controller()
class CorporativoController {
  constructor(private readonly corp: CorporativoService) {}

  @AdminOnly() @Get('admin/parceiros/:id/time') situacao(@Param('id', ParseIntPipe) id: number) { return this.corp.situacao(id); }
  @AdminOnly() @Post('admin/parceiros/:id/time') criar(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) { return this.corp.criarTime(id, eu.id); }
  @AdminOnly() @Post('admin/parceiros/:id/links') links(@Param('id', ParseIntPipe) id: number) { return this.corp.novosLinks(id); }

  @SkipAuth() @Get('times/convite/:codigo') convite(@Param('codigo') cod: string) { return this.corp.convite(validar(cod)); }
  @Post('times/convite/:codigo/entrar') entrar(@Param('codigo') cod: string, @CurrentUser() eu: AuthUser) { return this.corp.entrar(validar(cod), eu.id); }
  @SkipAuth() @Get('relatorio/:codigo') relatorio(@Param('codigo') cod: string) { return this.corp.relatorio(validar(cod)); }
}

function validar(cod: string) {
  if (!/^[\w-]{8,40}$/.test(cod)) throw new BadRequestException('Código inválido.');
  return cod;
}

@Module({ imports: [PulsoModule], controllers: [CorporativoController], providers: [CorporativoService] })
export class CorporativoModule {}
