import { BadRequestException, Body, Controller, Delete, forwardRef, Get, Inject, Injectable, Module, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { and, eq } from 'drizzle-orm';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { agora } from '../common/agora';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { CampaignModule } from '../campaign/campaign.module';
import { CampaignService, STATUS_ATIVA } from '../campaign/campaign.service';
import { AvisoModule } from '../aviso/aviso.module';
import { AvisoService } from '../aviso/aviso.service';
import { slug } from '../common/slug';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { pastaPrivada } from '../pulso/pulso.service';

class DoacaoDto {
  @IsIn(['vou_doar', 'doei']) situacao: 'vou_doar' | 'doei';
}

const d = schema.doacao;
const r = schema.registroDoacao;

// Marcar e desmarcar repetidamente não pode virar uma sequência de avisos ao dono do pedido
const jaAvisados = new Map<string, number>();
const UM_DIA = 86400000;
function deveAvisar(chave: string) {
  const agoraMs = Date.now();
  if ((jaAvisados.get(chave) ?? 0) > agoraMs - UM_DIA) return false;
  if (jaAvisados.size > 20000) jaAvisados.clear();
  jaAvisados.set(chave, agoraMs);
  return true;
}

@Injectable()
export class DoacaoService {
  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    @Inject(forwardRef(() => CampaignService)) private readonly campaigns: CampaignService,
    private readonly avisos: AvisoService,
  ) {}

  minhas(usuario: number) {
    return this.db.select({ campaign_id: d.campaign_id, situacao: d.situacao }).from(d).where(eq(d.user_id, usuario));
  }

  private async resposta(campanha: number, situacao: string | null) {
    const acoes = await this.campaigns.contagens([campanha]);
    return { campaign_id: campanha, situacao, acoes: acoes[campanha] };
  }

  private async apagarRegistroDoPedido(campanhaId: number, usuario: number) {
    const [linha] = await this.db.select().from(r).where(and(eq(r.campaign_id, campanhaId), eq(r.user_id, usuario)));
    if (!linha || linha.situacao === 'aprovado') return;
    await this.db.delete(r).where(eq(r.id, linha.id));
    if (linha.arquivo) await unlink(join(pastaPrivada(), linha.arquivo)).catch(() => undefined);
  }

  async marcar(campanhaId: number, usuario: number, situacao: 'vou_doar' | 'doei') {
    const campanha = await this.campaigns.uma(campanhaId);
    if (campanha.status !== STATUS_ATIVA || (campanha.statusPedido && campanha.statusPedido.situacao !== 'ativo')) {
      throw new BadRequestException('Este pedido está encerrado.');
    }
    const momento = agora();
    const doouEm = situacao === 'doei' ? momento : null;
    await this.db
      .insert(d)
      .values({ campaign_id: campanhaId, user_id: usuario, situacao, created_at: momento, updated_at: momento, doou_em: doouEm })
      .onDuplicateKeyUpdate({ set: { situacao, updated_at: momento, doou_em: doouEm } });
    if (situacao === 'doei') {
      // Quem já tem registro neste pedido não perde a data nem a confirmação
      await this.db.insert(r).ignore().values({ user_id: usuario, data: momento, campaign_id: campanhaId, origem: 'pedido', created_at: momento });
    } else {
      await this.apagarRegistroDoPedido(campanhaId, usuario);
    }
    if (campanha.user_id && campanha.user_id !== usuario && deveAvisar(`${campanhaId}:${usuario}:${situacao}`)) {
      const cidade = campanha.bcParent?.cityParent?.name ?? campanha.cityParent?.name;
      const uf = campanha.bcParent?.stateParent?.state ?? campanha.stateParent?.state;
      this.avisos
        .enviar(campanha.user_id, {
          titulo: situacao === 'doei' ? 'Alguém doou sangue!' : 'Alguém vai doar!',
          corpo: `${situacao === 'doei' ? 'Uma pessoa registrou doação' : 'Uma pessoa vai doar'} para ${campanha.name}.`,
          url: `/campanha/${slug([campanha.name, cidade, uf], campanha.id)}`,
          tag: `pedido-${campanhaId}`,
        })
        .catch(() => undefined);
    }
    return this.resposta(campanhaId, situacao);
  }

  async desfazer(campanhaId: number, usuario: number) {
    await this.db.delete(d).where(and(eq(d.campaign_id, campanhaId), eq(d.user_id, usuario)));
    await this.apagarRegistroDoPedido(campanhaId, usuario);
    return this.resposta(campanhaId, null);
  }
}

@ApiTags('doacoes')
@ApiBearerAuth()
@Controller()
class DoacaoController {
  constructor(private readonly doacoes: DoacaoService) {}

  @Get('doacoes/minhas')
  minhas(@CurrentUser() eu: AuthUser) {
    return this.doacoes.minhas(eu.id);
  }

  @Post('campaign/:id/doacao')
  marcar(@Param('id', ParseIntPipe) id: number, @Body() dados: DoacaoDto, @CurrentUser() eu: AuthUser) {
    return this.doacoes.marcar(id, eu.id, dados.situacao);
  }

  @Delete('campaign/:id/doacao')
  desfazer(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) {
    return this.doacoes.desfazer(id, eu.id);
  }
}

@Module({ imports: [CampaignModule, AvisoModule], controllers: [DoacaoController], providers: [DoacaoService] })
export class DoacaoModule {}
