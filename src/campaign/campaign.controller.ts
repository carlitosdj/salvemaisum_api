import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, SkipAuth } from '../auth/auth.decorators';
import { appUrl, apiUrl } from '../common/urls';
import { CampaignDto, SituacaoDto } from './campaign.dto';
import { CampaignService } from './campaign.service';

const RECEBE_DE: Record<string, string> = {
  '1': 'O-',
  '2': 'O+, O-',
  '3': 'A-, O-',
  '4': 'A+, A-, O+, O-',
  '5': 'B-, O-',
  '6': 'B+, B-, O+, O-',
  '7': 'A-, B-, AB-, O-',
  '8': 'A+, A-, B+, B-, AB+, AB-, O+, O-',
};

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

@ApiTags('campanhas')
@ApiBearerAuth()
@Controller()
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @SkipAuth()
  @Get('campaigns/:page/:take')
  listar(
    @Param('page', ParseIntPipe) page: number,
    @Param('take', ParseIntPipe) take: number,
    @Query('tipos') tipos?: string,
  ) {
    return this.mascararLista(this.campaigns.listarPublicas(page, take, tipos));
  }

  private async mascararLista<T extends { data: any[] }>(pagina: Promise<T>) {
    const r = await pagina;
    return { ...r, data: r.data.map((x) => this.campaigns.publica(x)) };
  }

  @SkipAuth()
  @Get('stats')
  stats() {
    return this.campaigns.numeros();
  }

  @SkipAuth()
  @Get('mycampaigns/:id')
  async doUsuario(@Param('id', ParseIntPipe) id: number) {
    return (await this.campaigns.doUsuario(id)).map((x) => this.campaigns.publica(x));
  }

  @SkipAuth()
  @Get('searchcampaign/:search')
  async buscar(@Param('search') termo: string) {
    return (await this.campaigns.buscar(termo)).map((x) => this.campaigns.publica(x));
  }

  @SkipAuth()
  @Get('searchcampaigncompatibility/:listBlood')
  compativeis(@Param('listBlood') lista: string) {
    return this.campaigns.contarCompativeis(lista);
  }

  @SkipAuth()
  @Get('campaign/:id')
  async uma(@Param('id', ParseIntPipe) id: number) {
    return this.campaigns.publica(await this.campaigns.uma(id));
  }

  @Get('campaign/:id/edicao')
  paraEdicao(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) {
    return this.campaigns.paraEdicao(id, eu);
  }

  @Post('campaign')
  criar(@Body() dados: CampaignDto, @CurrentUser() eu: AuthUser) {
    return this.campaigns.criar(dados, eu);
  }

  @Put('campaign/:id')
  atualizar(@Param('id', ParseIntPipe) id: number, @Body() dados: CampaignDto, @CurrentUser() eu: AuthUser) {
    return this.campaigns.atualizar(id, dados, eu);
  }

  @Patch('campaign/:id/situacao')
  situacao(@Param('id', ParseIntPipe) id: number, @Body() d: SituacaoDto, @CurrentUser() eu: AuthUser) {
    return this.campaigns.alterarSituacao(id, d.situacao, eu);
  }

  @Delete('campaign/:id')
  remover(@Param('id', ParseIntPipe) id: number, @CurrentUser() eu: AuthUser) {
    return this.campaigns.remover(id, eu);
  }

  // Prévia ao compartilhar em redes sociais
  @SkipAuth()
  @Get('bot/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async bot(@Param('id', ParseIntPipe) id: number) {
    const campanha = this.campaigns.publica(await this.campaigns.uma(id));
    const titulo = esc(`Ajude a salvar ${campanha.name}`);
    const descricao = esc(`Precisa de sangue: ${RECEBE_DE[campanha.bloodtype] ?? ''}.`);
    const url = `${appUrl()}/campanha/${campanha.id}`;
    const imagem = esc(`${apiUrl()}/files/${encodeURIComponent(campanha.image ?? '')}`);
    return `<html><head><title>${titulo}</title>
<meta name="description" content="${descricao}"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${titulo}"/>
<meta name="twitter:description" content="${descricao}"/>
<meta name="twitter:image" content="${imagem}"/>
<meta property="og:site_name" content="Salve Mais Um"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="${url}"/>
<meta property="og:title" content="${titulo}"/>
<meta property="og:description" content="${descricao}"/>
<meta property="og:image" content="${imagem}"/>
</head><body></body></html>`;
  }
}
