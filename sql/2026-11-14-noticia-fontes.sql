-- Fontes extras das notícias. A fonte principal continua em noticia.fonte_nome/fonte_url (o agente usa o link para não repetir matéria).
-- Criada à mão no banco de produção em 2026-11-14 (aprovada pelo usuário).

CREATE TABLE IF NOT EXISTS `noticia_fonte` (
  `id` int NOT NULL AUTO_INCREMENT,
  `noticia_id` int NOT NULL,
  `nome` varchar(160) DEFAULT NULL,
  `url` varchar(500) NOT NULL,
  `ordem` int NOT NULL DEFAULT 0,
  `created_at` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_noticia_fonte_noticia` (`noticia_id`, `ordem`),
  CONSTRAINT `fk_noticia_fonte_noticia` FOREIGN KEY (`noticia_id`) REFERENCES `noticia` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
