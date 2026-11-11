import Anthropic from '@anthropic-ai/sdk';
import { CHAVES_EDITORIAS, EDITORIAS } from './editorias';
import { Consumo, consumoDe, consumoZero, somar } from './precos';

// O redator procura uma notícia (ou escreve um guia) com busca na web e entrega pelo formulário entregar_noticia.
// Um revisor confere o rascunho contra os trechos da fonte. Nada é publicado aqui: vira rascunho para o admin aprovar.

const MODELO = 'claude-opus-5-5';
const BETAS: Anthropic.Beta.AnthropicBeta[] = ['server-side-fallback-2026-07-01'];
let cliente: Anthropic | null = null;
const claude = () => (cliente ??= new Anthropic());

const SISTEMA = `Você é o editor de notícias do Salve Mais Um, um site brasileiro e gratuito que conecta doadores de sangue a pacientes que precisam de doação. O público são doadores, pacientes e famílias, pessoas comuns, muitas vezes num momento difícil.

Seu trabalho: encontrar UMA notícia recente e relevante (ou escrever UM guia) sobre o tema pedido e entregá-la pronta para revisão humana, usando a ferramenta entregar_noticia. Uma pessoa da equipe sempre revisa antes de publicar.

FONTES
- Brasil em primeiro lugar. Notícias de fora só quando houver ponte clara com o Brasil.
- Prefira fontes de referência: Ministério da Saúde, Anvisa, CONITEC, INCA, hemocentros e hemorredes, Hemobrás, REDOME, ABHH, ABRALE, Fiocruz, universidades, OMS. Jornais e portais só quando citam essas fontes.
- Abra e leia a fonte principal com web_fetch antes de escrever. Nunca escreva com base só no resultado da busca.
- Notícia precisa ser recente (de preferência dos últimos 30 dias). Guia não precisa ser recente, mas precisa de fonte oficial.
- Não repita assunto já publicado (a lista vem no pedido). Se não achar nada bom e novo, entregue encontrou=false com o motivo. É melhor não entregar do que entregar algo fraco.

ESCRITA
- Português do Brasil, tom leve mas com profundidade: frases claras, sem jargão (explique o termo técnico quando usar), sem sensacionalismo.
- Escreva com as suas palavras. Nunca copie parágrafos da fonte. Citações curtas só entre aspas e atribuídas.
- Corpo com 350 a 700 palavras. Formato simples: parágrafos separados por linha em branco; subtítulo começando com "## "; itens de lista começando com "- ". Nada de HTML, markdown de negrito ou links no corpo.
- "o_que_muda": 2 a 4 frases práticas sobre o que a notícia muda para quem doa, para quem precisa de sangue ou para pacientes e famílias. Quando couber, convide a doar sangue ou a se cadastrar como doador de medula.

SAÚDE (regras obrigatórias)
- Nunca fale em "cura" como promessa, nunca indique dose, remédio ou tratamento para alguém, nunca compare tratamentos como conselho médico.
- Remédio aprovado ou pesquisado não é remédio disponível: diga com clareza se já está no SUS, só na rede privada, em pesquisa ou fora do Brasil.
- Em textos sobre doença, tratamento ou remédio, termine o corpo com: "Converse com o médico ou com a equipe que acompanha o tratamento."
- Regras de doação de sangue: siga o Ministério da Saúde; a decisão final é sempre do hemocentro, na triagem.
- Doação de sangue é voluntária e sem recompensa: nunca sugira prêmio, desconto ou vantagem para quem doa.

SEO E REDES
- titulo: até 100 caracteres, claro, como a pessoa pesquisaria no Google.
- titulo_seo: até 60 caracteres, para a aba do navegador e o Google.
- resumo: 1 ou 2 frases, até 220 caracteres; aparece na lista e no Google.
- palavra_chave: a expressão principal de busca (ex.: "doação de plaquetas").
- imagem_alt: descrição da capa para leitores de tela (a capa é uma arte com o título sobre fundo colorido).
- texto_instagram: legenda de 400 a 900 caracteres, com gancho na primeira linha, 1 ou 2 emojis no máximo, chamada para o link na bio e 5 a 8 hashtags em português no fim (inclua #doesangue e #salvemaisum).

REVISÃO
- trechos_fonte: de 3 a 6 trechos curtos copiados literalmente da fonte que sustentam os fatos principais (números, datas, nomes).
- pontos_conferir: o que a pessoa que revisa deve checar (um número, uma data, se algo já está no SUS). Lista vazia se não houver.`;

const EDITORIA_LISTA = CHAVES_EDITORIAS.map((k) => `${k} (${EDITORIAS[k]})`).join(', ');

// Formulário de entrega: strict garante que os campos chegam completos e no formato certo
const ENTREGA: Anthropic.Beta.BetaTool = {
  name: 'entregar_noticia',
  description: `Entrega a notícia ou o guia pronto para revisão. Use uma única vez, no fim. Editorias válidas: ${EDITORIA_LISTA}. Se não encontrou nada bom e novo, envie encontrou=false, explique em motivo e deixe os outros textos vazios.`,
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['encontrou', 'motivo', 'tipo', 'categoria', 'titulo', 'titulo_seo', 'resumo', 'palavra_chave', 'corpo', 'o_que_muda', 'fonte_nome', 'fonte_url', 'fonte_data', 'imagem_alt', 'texto_instagram', 'trechos_fonte', 'pontos_conferir'],
    properties: {
      encontrou: { type: 'boolean' },
      motivo: { type: 'string', description: 'Por que esta notícia importa agora, ou por que não encontrou nada.' },
      tipo: { type: 'string', enum: ['noticia', 'guia'] },
      categoria: { type: 'string', enum: [...CHAVES_EDITORIAS] },
      titulo: { type: 'string' },
      titulo_seo: { type: 'string' },
      resumo: { type: 'string' },
      palavra_chave: { type: 'string' },
      corpo: { type: 'string' },
      o_que_muda: { type: 'string' },
      fonte_nome: { type: 'string' },
      fonte_url: { type: 'string', description: 'Link da fonte principal, que você leu com web_fetch.' },
      fonte_data: { type: 'string', description: 'Data da publicação da fonte, AAAA-MM-DD, ou vazio se for guia.' },
      imagem_alt: { type: 'string' },
      texto_instagram: { type: 'string' },
      trechos_fonte: { type: 'array', items: { type: 'string' } },
      pontos_conferir: { type: 'array', items: { type: 'string' } },
    },
  },
};

export interface Rascunho {
  encontrou: boolean; motivo: string; tipo: 'noticia' | 'guia'; categoria: string;
  titulo: string; titulo_seo: string; resumo: string; palavra_chave: string; corpo: string; o_que_muda: string;
  fonte_nome: string; fonte_url: string; fonte_data: string; imagem_alt: string; texto_instagram: string;
  trechos_fonte: string[]; pontos_conferir: string[];
}

export interface Chamada { etapa: string; consumo: Consumo; ms: number }
export type Aviso = (mensagem: string) => void;

export interface Pedido {
  assunto: string;            // nome do tema ou o texto da pauta pedida pelo admin
  instrucao?: string | null;  // instrução do tema
  categoria?: string | null;
  tipo: 'noticia' | 'guia' | 'qualquer';
  hoje: string;               // AAAA-MM-DD
  jaPublicadas: string[];     // títulos recentes, para não repetir
  linksUsados: string[];      // fontes já usadas
}

// Uma chamada com streaming; avisa cada busca e cada página lida assim que acontecem
async function chamar(params: Anthropic.Beta.MessageCreateParamsNonStreaming, etapa: string, avisar: Aviso) {
  const inicio = Date.now();
  const stream = claude().beta.messages.stream(params);
  stream.on('contentBlock', (b) => {
    if (b.type === 'server_tool_use') {
      const entrada = (b.input ?? {}) as { query?: string; url?: string };
      if (b.name === 'web_search' && entrada.query) avisar(`Buscando: "${entrada.query}"`);
      if (b.name === 'web_fetch' && entrada.url) avisar(`Lendo: ${entrada.url}`);
    }
  });
  const msg = await stream.finalMessage();
  const chamada: Chamada = { etapa, consumo: consumoDe(msg.usage, msg.model), ms: Date.now() - inicio };
  return { msg, chamada };
}

function textoDoPedido(p: Pedido) {
  const linhas = [
    `Data de hoje: ${p.hoje}.`,
    `Assunto: ${p.assunto}.`,
    p.instrucao ? `Orientação para este assunto: ${p.instrucao}` : '',
    p.categoria ? `Editoria sugerida: ${p.categoria}.` : '',
    p.tipo === 'guia' ? 'Escreva um GUIA (conteúdo que não envelhece), com fonte oficial.' : p.tipo === 'noticia' ? 'Traga uma NOTÍCIA recente.' : 'Traga uma notícia recente; se não houver nada novo e bom, pode escrever um guia útil sobre o assunto.',
    p.jaPublicadas.length ? `Já temos estes textos, não repita o assunto:\n${p.jaPublicadas.map((t) => `- ${t}`).join('\n')}` : '',
    p.linksUsados.length ? `Fontes já usadas (não use de novo):\n${p.linksUsados.map((u) => `- ${u}`).join('\n')}` : '',
    'Pesquise, leia a fonte principal e entregue com a ferramenta entregar_noticia.',
  ];
  return linhas.filter(Boolean).join('\n\n');
}

export async function escrever(p: Pedido, avisar: Aviso): Promise<{ rascunho: Rascunho | null; motivo?: string; chamadas: Chamada[] }> {
  const chamadas: Chamada[] = [];
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: textoDoPedido(p) }];
  for (let volta = 0; volta < 6; volta++) {
    const { msg, chamada } = await chamar({
      model: MODELO,
      max_tokens: 32000,
      betas: BETAS,
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4, max_content_tokens: 20000 },
        ENTREGA,
      ],
      messages: mensagens,
    }, 'Pesquisa e redação', avisar);
    chamadas.push(chamada);

    if (msg.stop_reason === 'refusal') return { rascunho: null, motivo: `O modelo recusou o assunto (${msg.stop_details?.category ?? 'sem categoria'}).`, chamadas };
    const entrega = msg.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'entregar_noticia');
    if (entrega) {
      const r = entrega.input as Rascunho;
      if (!r.encontrou) return { rascunho: null, motivo: r.motivo || 'Nada novo e confiável sobre o assunto.', chamadas };
      return { rascunho: r, chamadas };
    }
    mensagens.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue; // o servidor retoma a busca de onde parou
    if (msg.stop_reason === 'max_tokens') return { rascunho: null, motivo: 'A resposta passou do limite de tamanho.', chamadas };
    mensagens.push({ role: 'user', content: 'Agora entregue o resultado usando a ferramenta entregar_noticia (ou encontrou=false com o motivo).' });
  }
  return { rascunho: null, motivo: 'O redator não entregou o texto depois de várias tentativas.', chamadas };
}

const REVISAO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['problemas'],
  properties: { problemas: { type: 'array', items: { type: 'string' } } },
};

// Segunda leitura, sem busca: compara o rascunho com os trechos da fonte e com as regras de saúde
export async function revisar(r: Rascunho, avisar: Aviso): Promise<{ problemas: string[]; chamada: Chamada }> {
  avisar('Revisando o rascunho');
  const { msg, chamada } = await chamar({
    model: MODELO,
    max_tokens: 8000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: REVISAO_SCHEMA } },
    system: 'Você revisa rascunhos de notícias de saúde do Salve Mais Um antes de uma pessoa aprovar. Aponte só problemas reais, em frases curtas em português: afirmação que os trechos da fonte não sustentam, número ou data divergente, promessa de cura, indicação de tratamento, remédio apresentado como disponível no SUS sem confirmação, prêmio por doar, texto copiado. Se estiver tudo certo, devolva a lista vazia.',
    messages: [{ role: 'user', content: JSON.stringify({ titulo: r.titulo, resumo: r.resumo, corpo: r.corpo, o_que_muda: r.o_que_muda, fonte: r.fonte_url, trechos_fonte: r.trechos_fonte }) }],
  }, 'Revisão', avisar);
  const texto = msg.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? '{}';
  try {
    return { problemas: (JSON.parse(texto).problemas ?? []) as string[], chamada };
  } catch {
    return { problemas: ['A revisão automática não devolveu um resultado legível. Revise com atenção.'], chamada };
  }
}

export const totalDe = (chamadas: Chamada[]) => chamadas.reduce((t, c) => somar(t, c.consumo), consumoZero());
