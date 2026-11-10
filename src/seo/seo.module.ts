import { Controller, Get, Header, Inject, Injectable, Module, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { and, desc, eq } from 'drizzle-orm';
import { Response } from 'express';
import { SkipAuth } from '../auth/auth.decorators';
import { idDoSlug, slug } from '../common/slug';
import { nomePublico } from '../common/nome';
import { apiUrl, appUrl } from '../common/urls';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';
import { CampaignModule } from '../campaign/campaign.module';
import { CampaignService, pedidoAberto, STATUS_ATIVA } from '../campaign/campaign.service';
import { NoticiaModule, NoticiaService } from '../noticia/noticia.module';

// O app é Vite (sem SSR): estas páginas levam o conteúdo no próprio HTML, para Google e redes sociais lerem sem JavaScript.
// Em produção o nginx do app encaminha /campanha/*, /hemocentro/*, /sitemap.xml e /robots.txt para cá.
const TIPOS: Record<string, string> = { '1': 'O−', '2': 'O+', '3': 'A−', '4': 'A+', '5': 'B−', '6': 'B+', '7': 'AB−', '8': 'AB+' };
const RECEBE: Record<string, string[]> = {
  '1': ['O−'], '2': ['O+', 'O−'], '3': ['A−', 'O−'], '4': ['A+', 'A−', 'O+', 'O−'],
  '5': ['B−', 'O−'], '6': ['B+', 'B−', 'O+', 'O−'], '7': ['A−', 'B−', 'AB−', 'O−'], '8': ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'],
};
const PAGINAS = ['', 'campanhas', 'hemocentros', 'posso-doar', 'medula', 'howtodonate', 'howitworks', 'initiative', 'whoweare', 'palestras', 'namidia', 'contact', 'noticias', 'acoes', 'apoiadores', 'doar', 'redessociais', 'direitos', 'times'];

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const resumo = (t: string, n = 158) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);
const jsonSeguro = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

// Mesmo formato do app: parágrafos, "## " para subtítulo e "- " para lista. Nada de HTML vindo do banco.
function blocoEmHtml(linhas: string[]): string {
  if (!linhas.length) return '';
  if (linhas[0].startsWith('## ')) return `<h2>${esc(linhas[0].slice(3))}</h2>${blocoEmHtml(linhas.slice(1))}`;
  if (linhas.every((l) => l.startsWith('- '))) return `<ul>${linhas.map((l) => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>`;
  return `<p>${linhas.map(esc).join(' ')}</p>`;
}

function textoEmHtml(texto: string) {
  return texto.split(/\n{2,}/).map((bloco) => blocoEmHtml(bloco.split('\n').map((l) => l.trim()).filter(Boolean))).join('\n');
}

interface Pagina { head: string; corpo: string; status: number; canonico?: string }

const previa = (arquivo?: string | null) => {
  if (!arquivo || /guestuser/.test(arquivo)) return `${appUrl()}/icones/icone-512.png`;
  return /^https?:/.test(arquivo) ? arquivo : `${apiUrl()}/preview/media/${encodeURIComponent(arquivo)}`;
};

function cabecalho(titulo: string, descricao: string, url: string, imagem: string, indexar: boolean, dados?: unknown) {
  return [
    `<title>${esc(titulo)}</title>`,
    `<meta name="description" content="${esc(descricao)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${indexar ? 'index,follow' : 'noindex'}" />`,
    `<meta property="og:site_name" content="Salve Mais Um" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(titulo)}" />`,
    `<meta property="og:description" content="${esc(descricao)}" />`,
    `<meta property="og:image" content="${esc(imagem)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    dados ? `<script type="application/ld+json">${jsonSeguro(dados)}</script>` : '',
  ].join('\n    ');
}

const naoEncontrada = (): Pagina => ({
  status: 404,
  head: '<title>Página não encontrada | Salve Mais Um</title>\n    <meta name="robots" content="noindex" />',
  corpo: '<div class="pagina"><h1>Página não encontrada</h1></div>',
});

@Injectable()
class SeoService {
  private molde = { html: '', em: 0 };

  constructor(
    @Inject(DB_SERVICE) private readonly db: DbType,
    private readonly campaigns: CampaignService,
    private readonly noticias: NoticiaService,
  ) {}

  async noticia(valor: string): Promise<Pagina> {
    let x: Awaited<ReturnType<NoticiaService['publicada']>>;
    try {
      x = await this.noticias.publicada(valor);
    } catch (erro) {
      if (erro instanceof NotFoundException) return naoEncontrada();
      throw erro;
    }
    const url = `${appUrl()}/noticias/${x.slug}`;
    const titulo = `${x.titulo} | Salve Mais Um`;
    const descricao = resumo(x.resumo || (x.corpo ?? '').replace(/\s+/g, ' '));
    const imagem = previa(x.imagem);
    const data = x.publicada_em ? new Date(x.publicada_em * 1000).toISOString() : undefined;
    const dados = {
      '@context': 'https://schema.org', '@type': x.tipo === 'guia' ? 'Article' : 'NewsArticle', headline: x.titulo, description: descricao,
      image: [imagem], datePublished: data, dateModified: data, inLanguage: 'pt-BR', mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'Salve Mais Um', url: appUrl() },
      publisher: { '@type': 'Organization', name: 'Salve Mais Um', logo: { '@type': 'ImageObject', url: `${appUrl()}/icones/icone-512.png` } },
      ...(x.fonte_url ? { isBasedOn: x.fonte_url } : {}),
    };
    return {
      status: 200,
      canonico: url,
      head: cabecalho(titulo, descricao, url, imagem, true, dados),
      corpo: `<article class="pagina">
  <h1>${esc(x.titulo)}</h1>
  ${x.resumo ? `<p><strong>${esc(x.resumo)}</strong></p>` : ''}
  ${textoEmHtml(x.corpo ?? '')}
  ${x.o_que_muda ? `<h2>O que isso muda para você</h2>${textoEmHtml(x.o_que_muda)}` : ''}
  ${x.fonte_url ? `<p>Fonte: <a href="${esc(x.fonte_url)}" rel="noopener">${esc(x.fonte_nome || x.fonte_url)}</a></p>` : ''}
  <p><a href="${appUrl()}/noticias">Mais notícias sobre doação de sangue</a></p>
</article>`,
    };
  }

  async campanha(valor: string): Promise<Pagina> {
    const id = idDoSlug(valor);
    if (!id) return naoEncontrada();
    let c: ReturnType<CampaignService['publica']> & Awaited<ReturnType<CampaignService['uma']>>;
    try {
      c = this.campaigns.publica(await this.campaigns.uma(id)) as typeof c;
    } catch (erro) {
      if (erro instanceof NotFoundException) return naoEncontrada();
      throw erro;
    }
    const cidade = c.bcParent?.cityParent?.name ?? c.cityParent?.name;
    const uf = c.bcParent?.stateParent?.state ?? c.stateParent?.state;
    const local = [cidade, uf].filter(Boolean).join('/');
    const tipo = TIPOS[c.bloodtype] ?? '';
    const aceita = (RECEBE[c.bloodtype] ?? []).join(', ');
    const hemocentro = c.bcParent?.name ?? c.bcname;
    const endereco = c.bcParent?.address ?? c.bcaddress;
    const url = `${appUrl()}/campanha/${slug([c.name, cidade, uf], c.id)}`;
    const titulo = `Doe sangue para ${c.name}${local ? ` em ${local}` : ''} | Salve Mais Um`;
    const descricao = resumo(`${c.name} precisa de doação de sangue ${tipo}${local ? ` em ${local}` : ''}. Podem doar: ${aceita}.${hemocentro ? ` Doações em ${hemocentro}.` : ''} Veja como ajudar.`);
    const imagem = previa(c.image);
    const dados = {
      '@context': 'https://schema.org', '@type': 'WebPage', name: titulo, description: descricao, url, image: imagem, inLanguage: 'pt-BR',
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Pedidos de doação', item: `${appUrl()}/campanhas` },
        { '@type': 'ListItem', position: 2, name: c.name, item: url },
      ] },
    };
    return {
      status: 200,
      canonico: url,
      head: cabecalho(titulo, descricao, url, imagem, c.status === STATUS_ATIVA && c.situacao === 'ativo', dados),
      corpo: `<article class="pagina">
  <h1>${esc(c.name)} precisa de doação de sangue</h1>
  <img src="${esc(imagem)}" alt="Foto de ${esc(c.name)}" width="480" />
  <p><strong>Tipo sanguíneo:</strong> ${esc(tipo)}. <strong>Podem doar:</strong> ${esc(aceita)}.</p>
  ${local ? `<p><strong>Local:</strong> ${esc(local)}</p>` : ''}
  ${hemocentro ? `<p><strong>Onde doar:</strong> ${esc(hemocentro)}${endereco ? `, ${esc(endereco)}` : ''}</p>` : ''}
  ${c.description ? `<p>${esc(c.description).replace(/\n/g, '<br />')}</p>` : ''}
  <p><a href="${appUrl()}/hemocentros">Encontre um hemocentro perto de você</a></p>
</article>`,
    };
  }

  async hemocentro(valor: string): Promise<Pagina> {
    const id = idDoSlug(valor);
    const h = id ? await this.db.query.bloodcenter.findFirst({
      where: eq(schema.bloodcenter.id, id),
      with: { cityParent: true, stateParent: true },
    }) : null;
    if (!h) return naoEncontrada();
    const cidade = h.cityParent?.name;
    const uf = h.stateParent?.state;
    const local = [cidade, uf].filter(Boolean).join('/');
    const url = `${appUrl()}/hemocentro/${slug([h.name, cidade, uf], h.id)}`;
    const titulo = `${h.name}${local ? ` em ${local}` : ''}: onde doar sangue | Salve Mais Um`;
    const descricao = resumo(`Doe sangue em ${h.name}${local ? `, ${local}` : ''}.${h.address ? ` Endereço: ${h.address}.` : ''}${h.phone ? ` Telefone: ${h.phone}.` : ''}`);
    const dados = {
      '@context': 'https://schema.org', '@type': 'MedicalOrganization', name: h.name, url, telephone: h.phone ?? undefined,
      address: { '@type': 'PostalAddress', streetAddress: h.address ?? undefined, addressLocality: cidade, addressRegion: uf, addressCountry: 'BR' },
    };
    return {
      status: 200,
      canonico: url,
      head: cabecalho(titulo, descricao, url, previa(h.image), true, dados),
      corpo: `<article class="pagina">
  <h1>${esc(h.name)}</h1>
  ${local ? `<p>${esc(local)}</p>` : ''}
  ${h.address ? `<p><strong>Endereço:</strong> ${esc(h.address)}</p>` : ''}
  ${h.phone ? `<p><strong>Telefone:</strong> ${esc(h.phone)}</p>` : ''}
  ${h.description ? `<p>${esc(h.description)}</p>` : ''}
</article>`,
    };
  }

  private async moldeHtml() {
    if (this.molde.html && Date.now() - this.molde.em < 60000) return this.molde.html;
    try {
      const r = await fetch(`${process.env.APP_INTERNAL_URL || appUrl()}/index.html`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) this.molde = { html: await r.text(), em: Date.now() };
    } catch { /* usa o último molde, ou o mínimo abaixo */ }
    return this.molde.html || '<!doctype html><html lang="pt-br"><head><meta charset="utf-8" /><title></title></head><body><div id="root"></div></body></html>';
  }

  async html(pagina: Pagina) {
    const molde = await this.moldeHtml();
    return molde
      .replace(/<meta name="description"[^>]*>\s*/i, '')
      .replace(/<title>[\s\S]*?<\/title>/i, () => pagina.head)
      .replace(/<div id="root"([^>]*)><\/div>/i, (_m, a) => `<div id="root"${a}>${pagina.corpo}</div>`);
  }

  async sitemap() {
    const [campanhas, centros, posts] = await Promise.all([
      this.db.query.campaign.findMany({
        where: and(eq(schema.campaign.status, STATUS_ATIVA), pedidoAberto),
        with: { privacidade: true, cityParent: true, stateParent: true, bcParent: { with: { cityParent: true, stateParent: true } } },
        orderBy: desc(schema.campaign.id),
      }),
      this.db.query.bloodcenter.findMany({ with: { cityParent: true, stateParent: true } }),
      this.db.select({ slug: schema.noticia.slug, publicada_em: schema.noticia.publicada_em }).from(schema.noticia).where(eq(schema.noticia.situacao, 'publicada')),
    ]);
    const item = (url: string, data?: number | null) =>
      `<url><loc>${esc(url)}</loc>${data ? `<lastmod>${new Date(data * 1000).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
    const linhas = [
      ...PAGINAS.map((p) => item(`${appUrl()}/${p}`)),
      ...campanhas.map((c) => item(`${appUrl()}/campanha/${slug([nomePublico(c.name, c.privacidade?.so_primeiro_nome), c.bcParent?.cityParent?.name ?? c.cityParent?.name, c.bcParent?.stateParent?.state ?? c.stateParent?.state], c.id)}`, c.created_at)),
      ...centros.map((h) => item(`${appUrl()}/hemocentro/${slug([h.name, h.cityParent?.name, h.stateParent?.state], h.id)}`)),
      ...posts.map((p) => item(`${appUrl()}/noticias/${p.slug}`, p.publicada_em)),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${linhas.join('')}</urlset>`;
  }
}

@ApiExcludeController()
@SkipAuth()
@Controller('seo')
class SeoController {
  constructor(private readonly seo: SeoService) {}

  private async responder(pagina: Pagina, pedido: string, prefixo: string, res: Response) {
    if (pagina.canonico && !pagina.canonico.endsWith(`/${prefixo}/${pedido}`)) return res.redirect(301, pagina.canonico);
    return res.status(pagina.status).type('html').send(await this.seo.html(pagina));
  }

  @Get('dados/campanha/:slug') dadosCampanha(@Param('slug') s: string) { return this.seo.campanha(s); }
  @Get('dados/hemocentro/:slug') dadosHemocentro(@Param('slug') s: string) { return this.seo.hemocentro(s); }

  @Get('campanha/:slug')
  async campanha(@Param('slug') s: string, @Res() res: Response) {
    return this.responder(await this.seo.campanha(s), s, 'campanha', res);
  }

  @Get('hemocentro/:slug')
  async hemocentro(@Param('slug') s: string, @Res() res: Response) {
    return this.responder(await this.seo.hemocentro(s), s, 'hemocentro', res);
  }

  @Get('noticias/:slug')
  async noticia(@Param('slug') s: string, @Res() res: Response) {
    return this.responder(await this.seo.noticia(s), s, 'noticias', res);
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  sitemap() { return this.seo.sitemap(); }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots() { return `User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /edit\nDisallow: /campaigns\nDisallow: /relatorio/\nDisallow: /times/convite/\n\nSitemap: ${appUrl()}/sitemap.xml\n`; }
}

@Module({ imports: [CampaignModule, NoticiaModule], controllers: [SeoController], providers: [SeoService] })
export class SeoModule {}
