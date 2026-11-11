-- Temas fixos que o agente usa para completar a fila, e acompanhamento de custo por execução e por notícia.
-- Criado à mão no banco de produção em 2026-11-11 (aprovado pelo usuário).

CREATE TABLE IF NOT EXISTS `noticia_tema` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(120) NOT NULL,
  `categoria` varchar(40) NOT NULL,
  `instrucao` text,
  `ativo` tinyint NOT NULL DEFAULT 1,
  `usado_em` int DEFAULT NULL,
  `created_at` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tema_ativo` (`ativo`, `usado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `agente_execucao`
  ADD COLUMN `pedido` varchar(12) NOT NULL DEFAULT 'fila' AFTER `situacao`,
  ADD COLUMN `pauta` varchar(500) DEFAULT NULL AFTER `pedido`,
  ADD COLUMN `pauta_tipo` varchar(12) DEFAULT NULL AFTER `pauta`,
  ADD COLUMN `quantidade` int NOT NULL DEFAULT 0 AFTER `pauta_tipo`,
  ADD COLUMN `etapa` varchar(255) DEFAULT NULL AFTER `quantidade`,
  ADD COLUMN `linha_do_tempo` mediumtext AFTER `etapa`,
  ADD COLUMN `buscas` int NOT NULL DEFAULT 0 AFTER `tokens_saida`,
  ADD COLUMN `tokens_cache_leitura` int NOT NULL DEFAULT 0 AFTER `buscas`,
  ADD COLUMN `tokens_cache_escrita` int NOT NULL DEFAULT 0 AFTER `tokens_cache_leitura`,
  ADD COLUMN `custo_usd` decimal(10,4) NOT NULL DEFAULT 0 AFTER `tokens_cache_escrita`,
  ADD COLUMN `pedido_por` int DEFAULT NULL AFTER `custo_usd`,
  ADD KEY `idx_execucao_situacao` (`situacao`);

ALTER TABLE `noticia`
  ADD COLUMN `palavra_chave` varchar(120) DEFAULT NULL AFTER `categoria`,
  ADD COLUMN `titulo_seo` varchar(70) DEFAULT NULL AFTER `titulo`,
  ADD COLUMN `imagem_alt` varchar(255) DEFAULT NULL AFTER `imagem`,
  ADD COLUMN `arte_feed` varchar(255) DEFAULT NULL AFTER `imagem_alt`,
  ADD COLUMN `arte_story` varchar(255) DEFAULT NULL AFTER `arte_feed`,
  ADD COLUMN `pontos_conferir` text AFTER `texto_instagram`,
  ADD COLUMN `tema_id` int DEFAULT NULL AFTER `execucao_id`,
  ADD COLUMN `tokens_entrada` int NOT NULL DEFAULT 0 AFTER `tema_id`,
  ADD COLUMN `tokens_saida` int NOT NULL DEFAULT 0 AFTER `tokens_entrada`,
  ADD COLUMN `buscas` int NOT NULL DEFAULT 0 AFTER `tokens_saida`,
  ADD COLUMN `custo_usd` decimal(10,4) NOT NULL DEFAULT 0 AFTER `buscas`,
  ADD CONSTRAINT `fk_noticia_tema` FOREIGN KEY (`tema_id`) REFERENCES `noticia_tema` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
