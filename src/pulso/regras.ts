export const DIA = 86400;

const NIVEIS = [
  { nome: 'Novo doador', minimo: 0 },
  { nome: 'Gota', minimo: 1 },
  { nome: 'Veia', minimo: 3 },
  { nome: 'Artéria', minimo: 6 },
  { nome: 'Coração', minimo: 10 },
];

// Quem não informou o sexo usa o intervalo que serve para qualquer pessoa.
export const intervaloDe = (sexo?: string | null) => (sexo === 'm' ? 60 : 90);
export const limiteAnual = (sexo?: string | null) => (sexo === 'm' ? 4 : 3);

/** Doações dentro do intervalo mínimo não contam: nenhum nível pode premiar doar antes da hora. */
export function contarValidas(datas: number[], sexo?: string | null) {
  const minimo = intervaloDe(sexo) * DIA;
  let total = 0;
  let anterior = -Infinity;
  for (const data of [...datas].sort((a, b) => a - b)) {
    if (data - anterior >= minimo) {
      total += 1;
      anterior = data;
    }
  }
  return total;
}

export function nivelDe(confirmadas: number) {
  const atual = [...NIVEIS].reverse().find((n) => confirmadas >= n.minimo);
  const proximo = NIVEIS.find((n) => n.minimo > confirmadas) ?? null;
  return { nome: atual.nome, confirmadas, proximo: proximo && { nome: proximo.nome, faltam: proximo.minimo - confirmadas } };
}

const MARCOS = [1, 5, 10, 25, 50, 100];

export function marcoDe(doacoes: number) {
  return [...MARCOS].reverse().find((m) => doacoes >= m) ?? 0;
}

export const proximoMarco = (doacoes: number) => MARCOS.find((m) => m > doacoes) ?? null;

export const doaParaTipos: Record<string, string[]> = {
  '1': ['1', '2', '3', '4', '5', '6', '7', '8'], '2': ['2', '4', '6', '8'], '3': ['3', '4', '7', '8'], '4': ['4', '8'],
  '5': ['5', '6', '7', '8'], '6': ['6', '8'], '7': ['7', '8'], '8': ['8'],
};
