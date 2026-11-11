// As 11 editorias do blog. A mesma lista existe no app (pages/Noticias.tsx) e no adm (NoticiasPage.tsx).
export const EDITORIAS = {
  doacao: 'Doação de sangue',
  hemocentros: 'Hemocentros',
  leucemias: 'Leucemias e linfomas',
  medula: 'Medula óssea e transplantes',
  tratamentos: 'Tratamentos e remédios',
  tecnologia: 'Equipamentos e tecnologia',
  doencas: 'Outras doenças do sangue',
  direitos: 'Direitos e políticas',
  historias: 'Histórias',
  mundo: 'Pelo mundo',
  salvemaisum: 'Salve Mais Um',
} as const;

export type Editoria = keyof typeof EDITORIAS;
export const CHAVES_EDITORIAS = Object.keys(EDITORIAS) as Editoria[];
