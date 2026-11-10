-- Notícias e guias do blog, e o registro das execuções do agente que sugere notícias.
-- Criadas à mão no banco de produção em 2026-11-10 (o projeto não usa drizzle-kit push).

CREATE TABLE IF NOT EXISTS `agente_execucao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `iniciou_em` int NOT NULL,
  `terminou_em` int DEFAULT NULL,
  `situacao` varchar(12) NOT NULL DEFAULT 'rodando',
  `encontradas` int NOT NULL DEFAULT 0,
  `rascunhos` int NOT NULL DEFAULT 0,
  `tokens_entrada` int NOT NULL DEFAULT 0,
  `tokens_saida` int NOT NULL DEFAULT 0,
  `erro` text,
  PRIMARY KEY (`id`),
  KEY `idx_execucao_inicio` (`iniciou_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `noticia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(160) NOT NULL,
  `tipo` varchar(12) NOT NULL DEFAULT 'noticia',
  `categoria` varchar(40) DEFAULT NULL,
  `titulo` varchar(200) NOT NULL,
  `resumo` varchar(400) DEFAULT NULL,
  `corpo` text,
  `o_que_muda` text,
  `fonte_nome` varchar(160) DEFAULT NULL,
  `fonte_url` varchar(500) DEFAULT NULL,
  `imagem` varchar(255) DEFAULT NULL,
  `texto_instagram` text,
  `situacao` varchar(12) NOT NULL DEFAULT 'rascunho',
  `publicar_em` int DEFAULT NULL,
  `publicada_em` int DEFAULT NULL,
  `origem` varchar(12) NOT NULL DEFAULT 'manual',
  `criado_por` int DEFAULT NULL,
  `execucao_id` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `updated_at` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_noticia_slug` (`slug`),
  KEY `idx_noticia_situacao` (`situacao`, `publicada_em`),
  KEY `idx_noticia_fonte` (`fonte_url`),
  KEY `fk_noticia_criador` (`criado_por`),
  KEY `fk_noticia_execucao` (`execucao_id`),
  CONSTRAINT `fk_noticia_criador` FOREIGN KEY (`criado_por`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_noticia_execucao` FOREIGN KEY (`execucao_id`) REFERENCES `agente_execucao` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
