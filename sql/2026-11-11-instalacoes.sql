-- Instalações do app (PWA): um registro por aparelho. Criada à mão no banco de produção em 2026-11-11 (aprovada pelo usuário).
-- origem: evento (o navegador avisou a instalação) | primeira_abertura (iPhone e casos sem aviso: contado ao abrir pela tela inicial)

CREATE TABLE IF NOT EXISTS `app_instalacao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `aparelho_id` varchar(64) NOT NULL,
  `user_id` int DEFAULT NULL,
  `plataforma` varchar(20) DEFAULT NULL,
  `navegador` varchar(40) DEFAULT NULL,
  `modelo` varchar(120) DEFAULT NULL,
  `versao_sistema` varchar(40) DEFAULT NULL,
  `origem` varchar(20) NOT NULL,
  `aberturas` int NOT NULL DEFAULT 0,
  `instalado_em` int NOT NULL,
  `ultimo_uso_em` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `updated_at` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instalacao_aparelho` (`aparelho_id`),
  KEY `idx_instalacao_data` (`instalado_em`),
  KEY `fk_instalacao_user` (`user_id`),
  CONSTRAINT `fk_instalacao_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
