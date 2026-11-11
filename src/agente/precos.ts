import type Anthropic from '@anthropic-ai/sdk';

// Preços de tabela em US$ por milhão de tokens (documentação da Anthropic, novembro de 2026).
// A escrita no cache de 5 minutos custa 1,25x a entrada. Busca na web: US$ 10 por mil buscas; ler páginas não é cobrado à parte.
const TABELA: Record<string, { entrada: number; saida: number; cacheLeitura: number }> = {
  'claude-opus-5-5': { entrada: 4, saida: 20, cacheLeitura: 0.2 },
  'claude-opus-5': { entrada: 5, saida: 25, cacheLeitura: 0.5 },
  'claude-opus-4-8': { entrada: 5, saida: 25, cacheLeitura: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cacheLeitura: 0.1 },
  'claude-sonnet-5': { entrada: 2, saida: 10, cacheLeitura: 0.2 },
};
const POR_BUSCA = 10 / 1000;

export interface Consumo {
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  cache_leitura: number;
  cache_escrita: number;
  buscas: number;
  leituras: number;
  custo_usd: number;
  estimado: boolean; // true quando o modelo não está na tabela e usamos o preço do Opus 5.5
}

export function consumoDe(uso: Anthropic.Beta.BetaUsage, modelo: string): Consumo {
  const p = TABELA[modelo] ?? TABELA['claude-opus-5-5'];
  const entrada = uso.input_tokens ?? 0;
  const saida = uso.output_tokens ?? 0;
  const leitura = uso.cache_read_input_tokens ?? 0;
  const escrita = uso.cache_creation_input_tokens ?? 0;
  const buscas = uso.server_tool_use?.web_search_requests ?? 0;
  const custo = (entrada * p.entrada + saida * p.saida + leitura * p.cacheLeitura + escrita * p.entrada * 1.25) / 1e6 + buscas * POR_BUSCA;
  return {
    modelo,
    tokens_entrada: entrada,
    tokens_saida: saida,
    cache_leitura: leitura,
    cache_escrita: escrita,
    buscas,
    leituras: uso.server_tool_use?.web_fetch_requests ?? 0,
    custo_usd: custo,
    estimado: !TABELA[modelo],
  };
}

export function somar(a: Consumo, b: Consumo): Consumo {
  return {
    modelo: b.modelo || a.modelo,
    tokens_entrada: a.tokens_entrada + b.tokens_entrada,
    tokens_saida: a.tokens_saida + b.tokens_saida,
    cache_leitura: a.cache_leitura + b.cache_leitura,
    cache_escrita: a.cache_escrita + b.cache_escrita,
    buscas: a.buscas + b.buscas,
    leituras: a.leituras + b.leituras,
    custo_usd: a.custo_usd + b.custo_usd,
    estimado: a.estimado || b.estimado,
  };
}

export const consumoZero = (): Consumo => ({ modelo: '', tokens_entrada: 0, tokens_saida: 0, cache_leitura: 0, cache_escrita: 0, buscas: 0, leituras: 0, custo_usd: 0, estimado: false });
