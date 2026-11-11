import * as crypto from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import * as opentype from 'opentype.js';
import * as sharp from 'sharp';

// Capas das notícias desenhadas aqui: o texto vira desenho com as fontes do site (a imagem da API não tem fontes instaladas).
// Três tamanhos: Google/WhatsApp/Facebook (1200x630), feed do Instagram (1080x1350) e stories (1080x1920).

const PASTA_FONTES = resolve(process.cwd(), 'assets', 'fontes');
const pastaUploads = () => resolve(process.env.UPLOADS_DIR || 'uploads');

let fontes: { titulo: opentype.Font; rotulo: opentype.Font; texto: opentype.Font } | null = null;
function carregarFontes() {
  if (fontes) return fontes;
  const abrir = (arquivo: string) => {
    const b = readFileSync(join(PASTA_FONTES, arquivo));
    return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  fontes = {
    titulo: abrir('bricolage-grotesque-latin-800-normal.woff'),
    rotulo: abrir('figtree-latin-700-normal.woff'),
    texto: abrir('figtree-latin-500-normal.woff'),
  };
  return fontes;
}

// Cada editoria tem o seu fundo; o texto é sempre claro sobre ele
const CORES: Record<string, { fundo: string; destaque: string }> = {
  doacao: { fundo: '#D4122B', destaque: '#FFF1CC' },
  hemocentros: { fundo: '#A30D22', destaque: '#FFF1CC' },
  leucemias: { fundo: '#5B1A3A', destaque: '#FFC857' },
  medula: { fundo: '#3D1F5C', destaque: '#FFC857' },
  tratamentos: { fundo: '#12355B', destaque: '#FFC857' },
  tecnologia: { fundo: '#1A3B4A', destaque: '#FFC857' },
  doencas: { fundo: '#7A2E12', destaque: '#FFF1CC' },
  direitos: { fundo: '#2B2B3A', destaque: '#FFC857' },
  historias: { fundo: '#D4122B', destaque: '#FFF1CC' },
  mundo: { fundo: '#1F4D3A', destaque: '#FFC857' },
  salvemaisum: { fundo: '#1A0B12', destaque: '#FF3B52' },
};

const LOGO = 'M16 1.5a13.5 13.5 0 0 1 0 27c-2.2 0-4.2-.5-6-1.4L3.6 30.4l1.7-6.8A13.5 13.5 0 0 1 16 1.5Z';
const GOTA = 'M16 7s-6.2 6.7-6.2 10.6a6.2 6.2 0 0 0 12.4 0C22.2 13.7 16 7 16 7Z';

// Layout letra a letra (sem substituições da fonte, que o opentype.js não suporta em todas): avanço + kerning
function medir(fonte: opentype.Font, texto: string, tamanho: number) {
  const escala = tamanho / fonte.unitsPerEm;
  const glifos = Array.from(texto).map((c) => fonte.charToGlyph(c));
  let x = 0;
  glifos.forEach((g, i) => {
    x += (g.advanceWidth ?? 0) * escala;
    if (i < glifos.length - 1) x += fonte.getKerningValue(g, glifos[i + 1]) * escala;
  });
  return x;
}

// Serializa os comandos do desenho com números simples (o toPathData do opentype.js gera valores que o conversor rejeita)
const n = (v: number) => (Math.round(v * 100) / 100).toString();
function paraSvg(comandos: opentype.PathCommand[]) {
  return comandos.map((c) => {
    switch (c.type) {
      case 'M': case 'L': return `${c.type}${n(c.x)} ${n(c.y)}`;
      case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      case 'Z': return 'Z';
      default: return '';
    }
  }).join('');
}

// Um <path> por letra: caminhos muito longos passam do limite de segurança do conversor de SVG e somem
function caminhoTexto(fonte: opentype.Font, texto: string, x: number, y: number, tamanho: number, cor: string) {
  const escala = tamanho / fonte.unitsPerEm;
  const glifos = Array.from(texto).map((c) => fonte.charToGlyph(c));
  const partes: string[] = [];
  glifos.forEach((g, i) => {
    const d = paraSvg(g.getPath(x, y, tamanho).commands);
    if (d) partes.push(`<path d="${d}"/>`);
    x += (g.advanceWidth ?? 0) * escala;
    if (i < glifos.length - 1) x += fonte.getKerningValue(g, glifos[i + 1]) * escala;
  });
  return `<g fill="${cor}">${partes.join('')}</g>`;
}

// Quebra o texto em linhas que cabem na largura; se passar do limite de linhas, termina com reticências
function linhas(fonte: opentype.Font, texto: string, tamanho: number, largura: number, maximo: number) {
  const palavras = texto.replace(/\s+/g, ' ').trim().split(' ');
  const saida: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (medir(fonte, tentativa, tamanho) <= largura || !atual) atual = tentativa;
    else { saida.push(atual); atual = p; }
  }
  if (atual) saida.push(atual);
  if (saida.length > maximo) {
    const cortadas = saida.slice(0, maximo);
    let ultima = cortadas[maximo - 1];
    while (ultima.length > 1 && medir(fonte, `${ultima}…`, tamanho) > largura) ultima = ultima.slice(0, -1).trimEnd();
    cortadas[maximo - 1] = `${ultima}…`;
    return cortadas;
  }
  return saida;
}

const caminho = (fonte: opentype.Font, texto: string, x: number, y: number, tamanho: number, cor: string) =>
  caminhoTexto(fonte, texto, x, y, tamanho, cor);

// Ajusta o tamanho do título para caber nas linhas disponíveis
function blocoTitulo(fonte: opentype.Font, titulo: string, largura: number, maxTamanho: number, minTamanho: number, maxLinhas: number) {
  for (let t = maxTamanho; t >= minTamanho; t -= 4) {
    const l = linhas(fonte, titulo, t, largura, 99);
    if (l.length <= maxLinhas) return { tamanho: t, linhas: l };
  }
  return { tamanho: minTamanho, linhas: linhas(fonte, titulo, minTamanho, largura, maxLinhas) };
}

interface Dados { titulo: string; categoria: string | null; rotulo: string; resumo?: string | null }

function desenhar(d: Dados, largura: number, altura: number) {
  const f = carregarFontes();
  const cor = CORES[d.categoria ?? ''] ?? CORES.doacao;
  const margem = Math.round(largura * 0.075);
  const util = largura - margem * 2;
  const horizontal = largura > altura;
  const partes: string[] = [];

  // Gota grande decorativa no canto
  const g = horizontal ? altura * 1.1 : largura * 0.9;
  partes.push(`<g transform="translate(${largura - g * 0.62} ${-g * 0.18}) scale(${g / 32})" opacity="0.10"><path fill="#FFFFFF" d="${LOGO}"/></g>`);

  // Rótulo da editoria
  const tRotulo = horizontal ? 26 : 34;
  let y = margem + tRotulo;
  partes.push(caminho(f.rotulo, d.rotulo.toUpperCase(), margem, y, tRotulo, cor.destaque));

  // Título
  const tit = horizontal
    ? blocoTitulo(f.titulo, d.titulo, util * 0.92, 76, 44, 3)
    : blocoTitulo(f.titulo, d.titulo, util, altura > 1600 ? 104 : 92, 56, altura > 1600 ? 7 : 6);
  const entre = tit.tamanho * 1.08;
  y += (horizontal ? 36 : 70) + tit.tamanho * 0.9;
  for (const l of tit.linhas) { partes.push(caminho(f.titulo, l, margem, y, tit.tamanho, '#FFFFFF')); y += entre; }

  // Resumo (só nos formatos verticais, onde há espaço)
  if (!horizontal && d.resumo) {
    const tResumo = 38;
    y += 30;
    for (const l of linhas(f.texto, d.resumo, tResumo, util, altura > 1600 ? 6 : 4)) {
      partes.push(caminho(f.texto, l, margem, y, tResumo, 'rgba(255,255,255,0.86)'));
      y += tResumo * 1.35;
    }
  }

  // Rodapé com a marca
  const tMarca = horizontal ? 30 : 40;
  const yBase = altura - margem;
  const lado = tMarca * 1.5;
  partes.push(`<g transform="translate(${margem} ${yBase - lado * 0.82}) scale(${lado / 32})"><path fill="#FFFFFF" d="${LOGO}"/><path fill="${cor.fundo}" d="${GOTA}"/></g>`);
  partes.push(caminho(f.titulo, 'Salve Mais Um', margem + lado + 14, yBase, tMarca, '#FFFFFF'));
  const site = 'salvemaisum.com.br';
  const tSite = horizontal ? 24 : 30;
  partes.push(caminho(f.rotulo, site, largura - margem - medir(f.rotulo, site, tSite), yBase, tSite, 'rgba(255,255,255,0.8)'));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
<rect width="100%" height="100%" fill="${cor.fundo}"/>
${partes.join('\n')}
</svg>`;
}

const FORMATOS = { capa: [1200, 630], feed: [1080, 1350], story: [1080, 1920] } as const;

// Grava as três artes em uploads e devolve os nomes dos arquivos
export async function gerarCapas(d: Dados) {
  mkdirSync(pastaUploads(), { recursive: true });
  const base = `noticia-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const nomes: Record<keyof typeof FORMATOS, string> = { capa: '', feed: '', story: '' };
  for (const [tipo, [l, a]] of Object.entries(FORMATOS) as [keyof typeof FORMATOS, readonly [number, number]][]) {
    const nome = `${base}-${tipo}.png`;
    const png = await sharp(Buffer.from(desenhar(d, l, a))).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(join(pastaUploads(), nome), png);
    nomes[tipo] = nome;
  }
  return nomes;
}
