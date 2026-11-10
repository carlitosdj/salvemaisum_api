// Mesmo cálculo de app/src/lib/util.ts: o id no fim é o que identifica o registro.
export function slug(partes: (string | null | undefined)[], id: number) {
  const texto = partes
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return texto ? `${texto}-${id}` : String(id);
}

export const idDoSlug = (valor: string) => {
  const achado = valor.match(/(\d+)$/);
  return achado ? Number(achado[1]) : null;
};
