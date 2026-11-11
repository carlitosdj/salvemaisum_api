-- Comentários e respostas nas notícias, e quem curtiu cada um. Criadas à mão no banco de produção em 2026-11-11 (aprovado pelo usuário).
-- situacao: publicado | revisao (suspeito ou denunciado, espera o adm) | oculto (adm escondeu) | removido (autor ou adm apagou)

CREATE TABLE IF NOT EXISTS `noticia_comentario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `noticia_id` int NOT NULL,
  `user_id` int NOT NULL,
  `parent_id` int DEFAULT NULL,
  `texto` text NOT NULL,
  `situacao` varchar(12) NOT NULL DEFAULT 'publicado',
  `motivo_revisao` varchar(255) DEFAULT NULL,
  `curtidas` int NOT NULL DEFAULT 0,
  `denuncias` int NOT NULL DEFAULT 0,
  `moderado_por` int DEFAULT NULL,
  `moderado_em` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `updated_at` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comentario_noticia` (`noticia_id`, `situacao`, `created_at`),
  KEY `idx_comentario_situacao` (`situacao`, `denuncias`),
  KEY `fk_comentario_user` (`user_id`),
  KEY `fk_comentario_parent` (`parent_id`),
  KEY `fk_comentario_moderador` (`moderado_por`),
  CONSTRAINT `fk_comentario_noticia` FOREIGN KEY (`noticia_id`) REFERENCES `noticia` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_comentario_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_comentario_parent` FOREIGN KEY (`parent_id`) REFERENCES `noticia_comentario` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_comentario_moderador` FOREIGN KEY (`moderado_por`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `noticia_comentario_curtida` (
  `comentario_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` int NOT NULL,
  PRIMARY KEY (`comentario_id`, `user_id`),
  KEY `fk_curtida_user` (`user_id`),
  CONSTRAINT `fk_curtida_comentario` FOREIGN KEY (`comentario_id`) REFERENCES `noticia_comentario` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_curtida_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
