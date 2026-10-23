-- Migration 0017: Versionar tabelas metas, medidas_direcao e medidas_progresso no Drizzle
-- Todas as tabelas já existem em produção — CREATE TABLE IF NOT EXISTS é idempotente.
-- BUG RAIZ CORRIGIDO: mapRow em db-orcamento.ts retornava periodoInicio como Date object
-- (não string), causando falha silenciosa em gerarConteudoAposAprovacao.

CREATE TABLE IF NOT EXISTS `metas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `loja_id` int NOT NULL,
  `mes` int NOT NULL,
  `ano` int NOT NULL,
  `titulo` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor_meta` decimal(15,2) DEFAULT NULL,
  `unidade` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'R$',
  `descricao` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'ativa',
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `medidas_direcao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `meta_id` int NOT NULL,
  `loja_id` int NOT NULL,
  `titulo` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descricao` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `indicador` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'custom',
  `meta_valor` decimal(15,4) DEFAULT NULL,
  `meta_operador` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'gte',
  `unidade` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '%',
  `peso_remuneracao_pct` decimal(5,2) DEFAULT 0,
  `ordem` int DEFAULT 0,
  `ativa` tinyint(1) DEFAULT 1,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `medidas_progresso` (
  `id` int NOT NULL AUTO_INCREMENT,
  `medida_id` int NOT NULL,
  `mes` int NOT NULL,
  `ano` int NOT NULL,
  `valor_atual` decimal(15,4) DEFAULT NULL,
  `atingida` tinyint(1) DEFAULT 0,
  `observacao` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medida_progresso` (`medida_id`, `mes`, `ano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
