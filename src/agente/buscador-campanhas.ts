import Anthropic from '@anthropic-ai/sdk';
import { consumoDe } from './precos';
import { Aviso, Chamada } from './redator';

// Busca campanhas públicas de doação de sangue no Brasil. Nada é publicado aqui: tudo vira sugestão para a equipe.
const MODELO = 'claude-opus-5-5';
let cliente: Anthropic | null = null;
const claude = () => (cliente ??= new Anthropic());

const SISTEMA = `Você ajuda a equipe do Salve Mais Um, um site brasileiro e gratuito que conecta doadores de sangue a quem precisa, a encontrar campanhas públicas de doação de sangue no Brasil. Tudo o que você encontrar será revisado por uma pessoa antes de qualquer uso.

DOIS TIPOS DE CAMPANHA
1. "hemocentro": campanhas de hemocentros, hemorredes, hospitais, secretarias de saúde ou empresas parceiras deles: alerta de estoque baixo, mutirão, coleta externa ou móvel, campanha de data (Carnaval, fim de ano, Junho Vermelho), horário especial. Sem dados de pacientes.
2. "familia": pedidos públicos de doação para um paciente específico, feitos pela família, por amigos, pelo hospital ou noticiados pela imprensa. Só traga quando o pedido pedir explicitamente o tipo de busca "familia" ou "ambos".

REGRAS
- Só campanhas no Brasil, ativas agora ou que começam em breve. Para "familia", só pedidos publicados nos últimos 7 dias.
- Abra e leia a página da fonte com web_fetch antes de entregar. Nunca invente datas, locais, tipos sanguíneos ou contatos: se a fonte não diz, deixe vazio.
- Para "familia": em "contato" copie apenas o meio de contato que a própria publicação divulgou (perfil, telefone do hospital, link), exatamente como está. Em "paciente_nome" use o nome como foi publicado. Nada disso será publicado; serve para a equipe procurar a família e pedir autorização.
- Não repita campanhas da lista de já encontradas.
- Datas no formato AAAA-MM-DD. tipos_sanguineos como lista separada por vírgula (ex.: "O-, O+") ou vazio.
- "pontos_conferir": o que a equipe deve checar (data, local, se a campanha ainda vale).
- Entregue tudo de uma vez com a ferramenta entregar_campanhas. Se não achar nada que preste, entregue a lista vazia. Qualidade importa mais que quantidade.`;

const ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'titulo', 'descricao', 'hemocentro_nome', 'cidade', 'uf', 'inicio', 'fim', 'tipos_sanguineos', 'paciente_nome', 'contato', 'fonte_nome', 'fonte_url', 'fonte_data', 'pontos_conferir'],
  properties: {
    tipo: { type: 'string', enum: ['hemocentro', 'familia'] },
    titulo: { type: 'string', description: 'Título curto e claro da campanha.' },
    descricao: { type: 'string', description: '2 a 4 frases com o que é, quem precisa e como participar.' },
    hemocentro_nome: { type: 'string', description: 'Onde doar, como aparece na fonte.' },
    cidade: { type: 'string' },
    uf: { type: 'string', description: 'Sigla do estado, ex.: MG.' },
    inicio: { type: 'string' },
    fim: { type: 'string' },
    tipos_sanguineos: { type: 'string' },
    paciente_nome: { type: 'string', description: 'Só para tipo familia; vazio para hemocentro.' },
    contato: { type: 'string', description: 'Só para tipo familia: o contato divulgado na publicação.' },
    fonte_nome: { type: 'string' },
    fonte_url: { type: 'string' },
    fonte_data: { type: 'string' },
    pontos_conferir: { type: 'array', items: { type: 'string' } },
  },
};

const ENTREGA: Anthropic.Beta.BetaTool = {
  name: 'entregar_campanhas',
  description: 'Entrega as campanhas encontradas (lista vazia se não houver nada confiável). Use uma única vez, no fim.',
  strict: true,
  input_schema: { type: 'object', additionalProperties: false, required: ['campanhas'], properties: { campanhas: { type: 'array', items: ITEM } } },
};

export interface CampanhaAchada {
  tipo: 'hemocentro' | 'familia'; titulo: string; descricao: string; hemocentro_nome: string; cidade: string; uf: string;
  inicio: string; fim: string; tipos_sanguineos: string; paciente_nome: string; contato: string;
  fonte_nome: string; fonte_url: string; fonte_data: string; pontos_conferir: string[];
}

export interface PedidoCampanhas { regiao: string; escopo: 'hemocentros' | 'familias' | 'ambos'; hoje: string; jaEncontradas: string[] }

export async function buscarCampanhas(p: PedidoCampanhas, avisar: Aviso): Promise<{ campanhas: CampanhaAchada[]; chamadas: Chamada[]; motivo?: string }> {
  const chamadas: Chamada[] = [];
  const tipo = p.escopo === 'hemocentros' ? 'hemocentro' : p.escopo === 'familias' ? 'familia' : 'ambos (hemocentro e familia)';
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content: [
      `Data de hoje: ${p.hoje}.`,
      `Região: ${p.regiao}.`,
      `Tipo de busca: ${tipo}.`,
      'Traga até 6 campanhas, as mais úteis e confiáveis.',
      p.jaEncontradas.length ? `Já encontradas (não repita):\n${p.jaEncontradas.map((t) => `- ${t}`).join('\n')}` : '',
      'Pesquise, leia as fontes e entregue com a ferramenta entregar_campanhas.',
    ].filter(Boolean).join('\n\n'),
  }];

  for (let volta = 0; volta < 6; volta++) {
    const inicio = Date.now();
    const stream = claude().beta.messages.stream({
      model: MODELO,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8, max_content_tokens: 12000 },
        ENTREGA,
      ],
      messages: mensagens,
    });
    stream.on('contentBlock', (b) => {
      if (b.type !== 'server_tool_use') return;
      const e = (b.input ?? {}) as { query?: string; url?: string };
      if (b.name === 'web_search' && e.query) avisar(`Buscando: "${e.query}"`);
      if (b.name === 'web_fetch' && e.url) avisar(`Lendo: ${e.url}`);
    });
    const msg = await stream.finalMessage();
    chamadas.push({ etapa: `Busca de campanhas: ${p.regiao}`, consumo: consumoDe(msg.usage, msg.model), ms: Date.now() - inicio });

    if (msg.stop_reason === 'refusal') return { campanhas: [], chamadas, motivo: `O modelo recusou (${msg.stop_details?.category ?? 'sem categoria'}).` };
    const entrega = msg.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'entregar_campanhas');
    if (entrega) return { campanhas: ((entrega.input as { campanhas: CampanhaAchada[] }).campanhas ?? []), chamadas };
    mensagens.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue;
    if (msg.stop_reason === 'max_tokens') return { campanhas: [], chamadas, motivo: 'A resposta passou do limite de tamanho.' };
    mensagens.push({ role: 'user', content: 'Agora entregue o resultado com a ferramenta entregar_campanhas (lista vazia se não houver nada confiável).' });
  }
  return { campanhas: [], chamadas, motivo: 'O buscador não entregou depois de várias tentativas.' };
}
