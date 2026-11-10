export const primeiroNome = (nome?: string | null) => (nome ?? '').trim().split(/\s+/)[0] ?? '';

// Único ponto que decide como o nome do paciente aparece para o público.
export const nomePublico = (nome: string | null | undefined, soPrimeiro?: number | null) =>
  soPrimeiro ? primeiroNome(nome) : nome ?? '';
