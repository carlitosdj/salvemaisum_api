const producao = () => process.env.NODE_ENV === 'production';
const limpar = (u?: string) => u?.trim().replace(/\/+$/, '') || undefined;

export const appUrl = () =>
  limpar(process.env.APP_URL) ?? (producao() ? 'https://salvemaisum.com.br' : 'http://localhost:3601');
export const admUrl = () =>
  limpar(process.env.ADM_URL) ?? (producao() ? 'https://adm.salvemaisum.com.br' : 'http://localhost:3602');
export const apiUrl = () =>
  limpar(process.env.API_URL) ?? (producao() ? 'https://api.salvemaisum.com.br' : 'http://localhost:3600');

export const origensPermitidas = () =>
  producao()
    ? [appUrl(), 'https://www.salvemaisum.com.br', admUrl()]
    : [appUrl(), admUrl(), 'http://127.0.0.1:3601', 'http://127.0.0.1:3602'];
