import { relations } from 'drizzle-orm';
import { decimal, double, index, int, mediumtext, mysqlTable, primaryKey, text, tinyint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';

// Espelha as tabelas da 2.0 (mesmos nomes de coluna): o banco de produção é reaproveitado.
// Este esquema aponta para o banco de produção: nunca rode drizzle-kit push; mudanças vão em migração revisada.
const fk = { onDelete: 'cascade', onUpdate: 'cascade' } as const;

export const state = mysqlTable('state', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }),
  state: varchar('state', { length: 255 }),
  country: int('country'),
});

export const city = mysqlTable('city', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }),
  state: int('state').references(() => state.id, fk),
});

export const profile = mysqlTable('profile', {
  user_id: int('user_id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }),
  gravatar_id: varchar('gravatar_id', { length: 255 }),
  image: varchar('image', { length: 255 }),
  country: varchar('country', { length: 255 }),
  bloodtype: varchar('bloodtype', { length: 255 }),
  candonate: varchar('candonate', { length: 255 }),
  city: int('city').references(() => city.id, fk),
  state: int('state').references(() => state.id, fk),
});

export const user = mysqlTable('user', {
  id: int('id').autoincrement().primaryKey(),
  username: varchar('username', { length: 255 }),
  email: varchar('email', { length: 190 }).unique(),
  password_hash: varchar('password_hash', { length: 60 }).notNull(),
  auth_key: varchar('auth_key', { length: 255 }),
  confirmed_at: int('confirmed_at'),
  unconfirmed_email: varchar('unconfirmed_email', { length: 255 }),
  blocked_at: int('blocked_at'),
  registration_ip: varchar('registration_ip', { length: 45 }),
  created_at: int('created_at').notNull(),
  updated_at: int('updated_at'),
  flags: int('flags').notNull().default(0),
  last_login_at: int('last_login_at'),
  profileUserId: int('profileUserId')
    .unique()
    .references(() => profile.user_id, fk),
});

export const bloodcenter = mysqlTable('bloodcenter', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }),
  image: varchar('image', { length: 255 }),
  address: varchar('address', { length: 255 }),
  country: varchar('country', { length: 255 }),
  phone: varchar('phone', { length: 255 }),
  region: varchar('region', { length: 255 }),
  email: varchar('email', { length: 255 }),
  description: varchar('description', { length: 255 }),
  status: int('status'),
  bccity: int('bccity').references(() => city.id, fk),
  bcstate: int('bcstate').references(() => state.id, fk),
});

export const campaign = mysqlTable('campaign', {
  id: int('id').autoincrement().primaryKey(),
  created_at: double('created_at'),
  name: varchar('name', { length: 255 }),
  bloodtype: varchar('bloodtype', { length: 255 }),
  image: varchar('image', { length: 255 }),
  status: int('status'),
  bcname: varchar('bcname', { length: 255 }),
  bcaddress: varchar('bcaddress', { length: 255 }),
  bccountry: varchar('bccountry', { length: 255 }),
  tags: varchar('tags', { length: 255 }),
  description: text('description'),
  user_id: int('user_id').references(() => profile.user_id, fk),
  bccity: int('bccity').references(() => city.id, fk),
  bcstate: int('bcstate').references(() => state.id, fk),
  bc: int('bc').references(() => bloodcenter.id, fk),
});

// Tabela nova da 3.0: colunas novas em `campaign` seriam apagadas pelo synchronize da API 2.0.
export const campaignStatus = mysqlTable('campaign_status', {
  campaign_id: int('campaign_id').primaryKey().references(() => campaign.id, fk),
  expires_at: int('expires_at'),
  situacao: varchar('situacao', { length: 20 }).notNull().default('ativo'),
  updated_at: int('updated_at').notNull(),
});

export const doacao = mysqlTable(
  'doacao',
  {
    id: int('id').autoincrement().primaryKey(),
    campaign_id: int('campaign_id').notNull().references(() => campaign.id, fk),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    situacao: varchar('situacao', { length: 20 }).notNull().default('vou_doar'),
    created_at: int('created_at').notNull(),
    updated_at: int('updated_at').notNull(),
    doou_em: int('doou_em'),
  },
  (t) => [uniqueIndex('uq_doacao_campaign_user').on(t.campaign_id, t.user_id), index('idx_doacao_user').on(t.user_id)],
);

export const pushInscricao = mysqlTable(
  'push_inscricao',
  {
    id: int('id').autoincrement().primaryKey(),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    endpoint_hash: varchar('endpoint_hash', { length: 64 }).notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: varchar('p256dh', { length: 200 }).notNull(),
    auth: varchar('auth', { length: 100 }).notNull(),
    dispositivo: varchar('dispositivo', { length: 255 }),
    instalado: int('instalado').notNull().default(0),
    created_at: int('created_at').notNull(),
  },
  (t) => [uniqueIndex('uq_push_endpoint').on(t.endpoint_hash), index('idx_push_user').on(t.user_id)],
);

// O que já foi avisado a cada pessoa: o lembrete nunca se repete.
export const avisoEnviado = mysqlTable(
  'aviso_enviado',
  {
    id: int('id').autoincrement().primaryKey(),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    tipo: varchar('tipo', { length: 30 }).notNull(),
    referencia: int('referencia').notNull(),
    created_at: int('created_at').notNull(),
  },
  (t) => [uniqueIndex('uq_aviso_enviado').on(t.user_id, t.tipo, t.referencia)],
);

export const doador = mysqlTable('doador', {
  user_id: int('user_id').primaryKey().references(() => user.id, fk),
  sexo: varchar('sexo', { length: 1 }),
  raio_km: int('raio_km').notNull().default(30),
  aceita_alertas: int('aceita_alertas').notNull().default(1),
  lgpd_aceite_em: int('lgpd_aceite_em').notNull(),
  updated_at: int('updated_at').notNull(),
});

export const pedidoPrivacidade = mysqlTable('pedido_privacidade', {
  campaign_id: int('campaign_id').primaryKey().references(() => campaign.id, fk),
  consentido_em: int('consentido_em').notNull(),
  autorizado_por: int('autorizado_por').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  vinculo: varchar('vinculo', { length: 20 }).notNull(),
  so_primeiro_nome: int('so_primeiro_nome').notNull().default(0),
  updated_at: int('updated_at').notNull(),
});

export const indicacao = mysqlTable(
  'indicacao',
  {
    convidado_id: int('convidado_id').primaryKey().references(() => user.id, fk),
    convidador_id: int('convidador_id').notNull().references(() => user.id, fk),
    created_at: int('created_at').notNull(),
  },
  (t) => [index('idx_indicacao_convidador').on(t.convidador_id)],
);

export const agradecimento = mysqlTable(
  'agradecimento',
  {
    id: int('id').autoincrement().primaryKey(),
    campaign_id: int('campaign_id').notNull().references(() => campaign.id, fk),
    autor_id: int('autor_id').notNull().references(() => user.id, fk),
    mensagem: varchar('mensagem', { length: 500 }).notNull(),
    oculto: int('oculto').notNull().default(0),
    created_at: int('created_at').notNull(),
  },
  (t) => [index('idx_agr_campaign').on(t.campaign_id)],
);

// Fonte única das doações feitas: com ou sem pedido, novas ou antigas.
export const registroDoacao = mysqlTable(
  'registro_doacao',
  {
    id: int('id').autoincrement().primaryKey(),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    data: int('data').notNull(),
    bloodcenter_id: int('bloodcenter_id').references(() => bloodcenter.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    campaign_id: int('campaign_id').references(() => campaign.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    origem: varchar('origem', { length: 12 }).notNull(),
    arquivo: varchar('arquivo', { length: 255 }),
    situacao: varchar('situacao', { length: 12 }).notNull().default('declarada'),
    revisado_por: int('revisado_por').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    revisado_em: int('revisado_em'),
    created_at: int('created_at').notNull(),
  },
  (t) => [uniqueIndex('uq_registro_pedido').on(t.user_id, t.campaign_id), index('idx_registro_situacao').on(t.situacao), index('idx_registro_data').on(t.data)],
);

export const muralDoador = mysqlTable('mural_doador', {
  user_id: int('user_id').primaryKey().references(() => user.id, fk),
  nome_exibido: varchar('nome_exibido', { length: 60 }).notNull(),
  mostrar_cidade: int('mostrar_cidade').notNull().default(1),
  aceito_em: int('aceito_em').notNull(),
});

export const doacaoAgenda = mysqlTable(
  'doacao_agenda',
  {
    id: int('id').autoincrement().primaryKey(),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    bloodcenter_id: int('bloodcenter_id').references(() => bloodcenter.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    campaign_id: int('campaign_id').references(() => campaign.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    quando: int('quando').notNull(),
    created_at: int('created_at').notNull(),
  },
  (t) => [index('idx_agenda_quando').on(t.quando)],
);

export const plantao = mysqlTable(
  'plantao',
  {
    id: int('id').autoincrement().primaryKey(),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    inicio: int('inicio').notNull(),
    fim: int('fim').notNull(),
    created_at: int('created_at').notNull(),
  },
  (t) => [index('idx_plantao_fim').on(t.fim)],
);

export const medulaContato = mysqlTable('medula_contato', {
  user_id: int('user_id').primaryKey().references(() => user.id, fk),
  cadastrado_em: int('cadastrado_em'),
  confirmado_em: int('confirmado_em').notNull(),
});

export const destaqueMes = mysqlTable(
  'destaque_mes',
  {
    id: int('id').autoincrement().primaryKey(),
    mes: int('mes').notNull(),
    nome: varchar('nome', { length: 80 }).notNull(),
    historia: varchar('historia', { length: 800 }).notNull(),
    foto: varchar('foto', { length: 255 }),
    autorizado_em: int('autorizado_em').notNull(),
    created_at: int('created_at').notNull(),
  },
  (t) => [index('idx_dest_mes').on(t.mes)],
);

export const pedidoVerificacao = mysqlTable('pedido_verificacao', {
  campaign_id: int('campaign_id').primaryKey().references(() => campaign.id, fk),
  verificado_por: int('verificado_por').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  verificado_em: int('verificado_em').notNull(),
  fonte: varchar('fonte', { length: 120 }).notNull(),
});

export const pedidoDenuncia = mysqlTable(
  'pedido_denuncia',
  {
    id: int('id').autoincrement().primaryKey(),
    campaign_id: int('campaign_id').notNull().references(() => campaign.id, fk),
    autor_id: int('autor_id').notNull().references(() => user.id, fk),
    motivo: varchar('motivo', { length: 500 }).notNull(),
    resolvida_em: int('resolvida_em'),
    created_at: int('created_at').notNull(),
  },
  (t) => [uniqueIndex('uq_den').on(t.campaign_id, t.autor_id)],
);

export const apadrinhamento = mysqlTable(
  'apadrinhamento',
  {
    id: int('id').autoincrement().primaryKey(),
    novato_id: int('novato_id').notNull().references(() => user.id, fk),
    padrinho_id: int('padrinho_id').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    situacao: varchar('situacao', { length: 12 }).notNull().default('aberto'),
    created_at: int('created_at').notNull(),
  },
  (t) => [index('idx_ap_sit').on(t.situacao)],
);

export const apadrinhamentoMensagem = mysqlTable(
  'apadrinhamento_mensagem',
  {
    id: int('id').autoincrement().primaryKey(),
    apadrinhamento_id: int('apadrinhamento_id').notNull().references(() => apadrinhamento.id, fk),
    autor_id: int('autor_id').notNull().references(() => user.id, fk),
    texto: varchar('texto', { length: 500 }).notNull(),
    created_at: int('created_at').notNull(),
  },
  (t) => [index('idx_msg_ap').on(t.apadrinhamento_id)],
);

export const campaignMeta = mysqlTable('campaign_meta', {
  campaign_id: int('campaign_id').primaryKey().references(() => campaign.id, fk),
  meta_doadores: int('meta_doadores').notNull(),
  updated_at: int('updated_at').notNull(),
});

export const time = mysqlTable('time', {
  id: int('id').autoincrement().primaryKey(),
  nome: varchar('nome', { length: 80 }).notNull(),
  tipo: varchar('tipo', { length: 20 }).notNull(),
  cidade: int('cidade').references(() => city.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  criado_por: int('criado_por').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  created_at: int('created_at').notNull(),
});

export const timeMembro = mysqlTable(
  'time_membro',
  {
    time_id: int('time_id').notNull().references(() => time.id, fk),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    created_at: int('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.time_id, t.user_id] }), index('idx_membro_user').on(t.user_id)],
);

// Blog: notícias e guias. O agente sugere rascunhos; só o admin publica. DDL em api/sql/2026-11-10-noticias.sql.
export const agenteExecucao = mysqlTable('agente_execucao', {
  id: int('id').autoincrement().primaryKey(),
  iniciou_em: int('iniciou_em').notNull(),
  terminou_em: int('terminou_em'),
  situacao: varchar('situacao', { length: 12 }).notNull().default('rodando'),
  pedido: varchar('pedido', { length: 12 }).notNull().default('fila'),
  pauta: varchar('pauta', { length: 500 }),
  pauta_tipo: varchar('pauta_tipo', { length: 12 }),
  quantidade: int('quantidade').notNull().default(0),
  etapa: varchar('etapa', { length: 255 }),
  linha_do_tempo: mediumtext('linha_do_tempo'),
  encontradas: int('encontradas').notNull().default(0),
  rascunhos: int('rascunhos').notNull().default(0),
  tokens_entrada: int('tokens_entrada').notNull().default(0),
  tokens_saida: int('tokens_saida').notNull().default(0),
  buscas: int('buscas').notNull().default(0),
  tokens_cache_leitura: int('tokens_cache_leitura').notNull().default(0),
  tokens_cache_escrita: int('tokens_cache_escrita').notNull().default(0),
  custo_usd: decimal('custo_usd', { precision: 10, scale: 4, mode: 'number' }).notNull().default(0),
  pedido_por: int('pedido_por'),
  erro: text('erro'),
});

export const noticiaTema = mysqlTable('noticia_tema', {
  id: int('id').autoincrement().primaryKey(),
  nome: varchar('nome', { length: 120 }).notNull(),
  categoria: varchar('categoria', { length: 40 }).notNull(),
  instrucao: text('instrucao'),
  ativo: tinyint('ativo').notNull().default(1),
  usado_em: int('usado_em'),
  created_at: int('created_at').notNull(),
});

export const noticia = mysqlTable(
  'noticia',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull(),
    tipo: varchar('tipo', { length: 12 }).notNull().default('noticia'),
    categoria: varchar('categoria', { length: 40 }),
    palavra_chave: varchar('palavra_chave', { length: 120 }),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    titulo_seo: varchar('titulo_seo', { length: 70 }),
    resumo: varchar('resumo', { length: 400 }),
    corpo: text('corpo'),
    o_que_muda: text('o_que_muda'),
    fonte_nome: varchar('fonte_nome', { length: 160 }),
    fonte_url: varchar('fonte_url', { length: 500 }),
    imagem: varchar('imagem', { length: 255 }),
    imagem_alt: varchar('imagem_alt', { length: 255 }),
    arte_feed: varchar('arte_feed', { length: 255 }),
    arte_story: varchar('arte_story', { length: 255 }),
    texto_instagram: text('texto_instagram'),
    pontos_conferir: text('pontos_conferir'),
    situacao: varchar('situacao', { length: 12 }).notNull().default('rascunho'),
    publicar_em: int('publicar_em'),
    publicada_em: int('publicada_em'),
    origem: varchar('origem', { length: 12 }).notNull().default('manual'),
    criado_por: int('criado_por').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    execucao_id: int('execucao_id').references(() => agenteExecucao.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    tema_id: int('tema_id').references(() => noticiaTema.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    tokens_entrada: int('tokens_entrada').notNull().default(0),
    tokens_saida: int('tokens_saida').notNull().default(0),
    buscas: int('buscas').notNull().default(0),
    custo_usd: decimal('custo_usd', { precision: 10, scale: 4, mode: 'number' }).notNull().default(0),
    curtidas: int('curtidas').notNull().default(0),
    created_at: int('created_at').notNull(),
    updated_at: int('updated_at').notNull(),
  },
  (t) => [uniqueIndex('uq_noticia_slug').on(t.slug), index('idx_noticia_situacao').on(t.situacao, t.publicada_em), index('idx_noticia_fonte').on(t.fonte_url)],
);

// Instalações do app (PWA), uma linha por aparelho. DDL em api/sql/2026-11-11-instalacoes.sql.
export const appInstalacao = mysqlTable('app_instalacao', {
  id: int('id').autoincrement().primaryKey(),
  aparelho_id: varchar('aparelho_id', { length: 64 }).notNull(),
  user_id: int('user_id').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  plataforma: varchar('plataforma', { length: 20 }),
  navegador: varchar('navegador', { length: 40 }),
  modelo: varchar('modelo', { length: 120 }),
  versao_sistema: varchar('versao_sistema', { length: 40 }),
  origem: varchar('origem', { length: 20 }).notNull(),
  aberturas: int('aberturas').notNull().default(0),
  instalado_em: int('instalado_em').notNull(),
  ultimo_uso_em: int('ultimo_uso_em'),
  created_at: int('created_at').notNull(),
  updated_at: int('updated_at').notNull(),
});

// Comentários das notícias. DDL em api/sql/2026-11-11-comentarios.sql.
export const noticiaComentario = mysqlTable('noticia_comentario', {
  id: int('id').autoincrement().primaryKey(),
  noticia_id: int('noticia_id').notNull().references(() => noticia.id, fk),
  user_id: int('user_id').notNull().references(() => user.id, fk),
  parent_id: int('parent_id').references((): AnyMySqlColumn => noticiaComentario.id, fk),
  texto: text('texto').notNull(),
  situacao: varchar('situacao', { length: 12 }).notNull().default('publicado'),
  motivo_revisao: varchar('motivo_revisao', { length: 255 }),
  curtidas: int('curtidas').notNull().default(0),
  denuncias: int('denuncias').notNull().default(0),
  moderado_por: int('moderado_por').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  moderado_em: int('moderado_em'),
  created_at: int('created_at').notNull(),
  updated_at: int('updated_at').notNull(),
});

export const noticiaComentarioCurtida = mysqlTable(
  'noticia_comentario_curtida',
  {
    comentario_id: int('comentario_id').notNull().references(() => noticiaComentario.id, fk),
    user_id: int('user_id').notNull().references(() => user.id, fk),
    created_at: int('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.comentario_id, t.user_id] })],
);

// Campanhas achadas pelo agente. DDL em api/sql/2026-11-11-campanhas.sql.
export const campanhaSugestao = mysqlTable('campanha_sugestao', {
  id: int('id').autoincrement().primaryKey(),
  execucao_id: int('execucao_id').references(() => agenteExecucao.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  tipo: varchar('tipo', { length: 12 }).notNull(),
  situacao: varchar('situacao', { length: 12 }).notNull().default('nova'),
  titulo: varchar('titulo', { length: 200 }).notNull(),
  descricao: text('descricao'),
  hemocentro_nome: varchar('hemocentro_nome', { length: 255 }),
  bloodcenter_id: int('bloodcenter_id').references(() => bloodcenter.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  cidade_nome: varchar('cidade_nome', { length: 120 }),
  uf: varchar('uf', { length: 2 }),
  city_id: int('city_id').references(() => city.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  inicio: varchar('inicio', { length: 10 }),
  fim: varchar('fim', { length: 10 }),
  tipos_sanguineos: varchar('tipos_sanguineos', { length: 60 }),
  paciente_nome: varchar('paciente_nome', { length: 120 }),
  contato: text('contato'),
  fonte_nome: varchar('fonte_nome', { length: 160 }),
  fonte_url: varchar('fonte_url', { length: 500 }).notNull(),
  fonte_data: varchar('fonte_data', { length: 10 }),
  pontos_conferir: text('pontos_conferir'),
  observacao: text('observacao'),
  acao_id: int('acao_id'),
  campaign_id: int('campaign_id'),
  decidido_por: int('decidido_por').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  decidido_em: int('decidido_em'),
  tokens_entrada: int('tokens_entrada').notNull().default(0),
  tokens_saida: int('tokens_saida').notNull().default(0),
  buscas: int('buscas').notNull().default(0),
  custo_usd: decimal('custo_usd', { precision: 10, scale: 4, mode: 'number' }).notNull().default(0),
  created_at: int('created_at').notNull(),
  updated_at: int('updated_at').notNull(),
});

export const cidadeCoordenada = mysqlTable('cidade_coordenada', {
  city_id: int('city_id').primaryKey().references(() => city.id, fk),
  latitude: double('latitude').notNull(),
  longitude: double('longitude').notNull(),
});

export const contact = mysqlTable('contact', {
  id: int('id').autoincrement().primaryKey(),
  created_at: double('created_at'),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  subject: varchar('subject', { length: 255 }),
  message: text('message'),
});

export const component = mysqlTable('component', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }),
  description: text('description'),
  created_at: double('created_at'),
  status: int('status'),
  order: int('order'),
  duration: int('duration'),
  tags: varchar('tags', { length: 255 }),
  component_id: int('component_id').references((): AnyMySqlColumn => component.id, fk),
});

export const componentExtra = mysqlTable('component_extra', {
  id: int('id').autoincrement().primaryKey(),
  key_extra: varchar('key_extra', { length: 100 }),
  value_extra: text('value_extra'),
  created_at: double('created_at'),
  status: int('status'),
  component_id: int('component_id').references(() => component.id, fk),
});

// Os nomes das relações são os que o front da 2.0 já lê (cityParent, bcParent, parentUser...)
export const profileRelations = relations(profile, ({ one }) => ({
  cityParent: one(city, { fields: [profile.city], references: [city.id] }),
  stateParent: one(state, { fields: [profile.state], references: [state.id] }),
}));

export const userRelations = relations(user, ({ one }) => ({
  profile: one(profile, { fields: [user.profileUserId], references: [profile.user_id] }),
}));

export const bloodcenterRelations = relations(bloodcenter, ({ one }) => ({
  cityParent: one(city, { fields: [bloodcenter.bccity], references: [city.id] }),
  stateParent: one(state, { fields: [bloodcenter.bcstate], references: [state.id] }),
}));

export const campaignRelations = relations(campaign, ({ one }) => ({
  privacidade: one(pedidoPrivacidade, { fields: [campaign.id], references: [pedidoPrivacidade.campaign_id] }),
  meta: one(campaignMeta, { fields: [campaign.id], references: [campaignMeta.campaign_id] }),
  verificacao: one(pedidoVerificacao, { fields: [campaign.id], references: [pedidoVerificacao.campaign_id] }),
  statusPedido: one(campaignStatus, { fields: [campaign.id], references: [campaignStatus.campaign_id] }),
  parentUser: one(profile, { fields: [campaign.user_id], references: [profile.user_id] }),
  cityParent: one(city, { fields: [campaign.bccity], references: [city.id] }),
  stateParent: one(state, { fields: [campaign.bcstate], references: [state.id] }),
  bcParent: one(bloodcenter, { fields: [campaign.bc], references: [bloodcenter.id] }),
}));

export const componentRelations = relations(component, ({ one, many }) => ({
  parent: one(component, {
    fields: [component.component_id],
    references: [component.id],
    relationName: 'tree',
  }),
  children: many(component, { relationName: 'tree' }),
  extras: many(componentExtra),
}));

export const componentExtraRelations = relations(componentExtra, ({ one }) => ({
  parent: one(component, {
    fields: [componentExtra.component_id],
    references: [component.id],
  }),
}));
