-- Migration 0013: Tabelas do módulo de remuneração variável
-- Idempotente: CREATE TABLE IF NOT EXISTS + ALTER idempotente via information_schema.
-- Todas as colunas monetárias (R$) são decimal(15,2) — sem float.
-- Aplicar com: webdev_execute_sql ou pnpm drizzle-kit migrate

-- ─── remuneracao_config ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `remuneracao_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `loja_id` int NOT NULL,
  `ativa` tinyint(1) DEFAULT 1,
  `bonus_base_pct_faturamento` decimal(6,4) DEFAULT 0.0150,
  `gatilho_minimo_pct` decimal(5,2) DEFAULT 80.00,
  `teto_maximo_pct` decimal(5,2) DEFAULT 120.00,
  `descricao` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── remuneracao_regras ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `remuneracao_regras` (
  `id` int NOT NULL AUTO_INCREMENT,
  `config_id` int NOT NULL,
  `titulo` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descricao` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'manual',
  `indicador` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'custom',
  `meta_valor` decimal(15,4) DEFAULT NULL,
  `meta_operador` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'gte',
  `desconto_pct` decimal(5,2) NOT NULL DEFAULT 25.00,
  `ordem` int DEFAULT 0,
  `ativa` tinyint(1) DEFAULT 1,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── remuneracao_apuracao ─────────────────────────────────────────────────────
-- bonus_final_rs e demais colunas monetárias: decimal(15,2) — nunca float.
CREATE TABLE IF NOT EXISTS `remuneracao_apuracao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `loja_id` int NOT NULL,
  `mes` int NOT NULL,
  `ano` int NOT NULL,
  `faturamento_real` decimal(15,2) DEFAULT NULL,
  `bonus_base_rs` decimal(15,2) DEFAULT NULL,
  `resultado_atingimento_pct` decimal(5,2) DEFAULT NULL,
  `bonus_final_rs` decimal(15,2) DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'rascunho',
  `observacao` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aprovado_por` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aprovado_em` bigint DEFAULT NULL,
  `created_at` bigint NOT NULL,
  `employee_id` int DEFAULT NULL,
  `papel` enum('gestor','lider') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `legado` tinyint(1) NOT NULL DEFAULT 0,
  `extrato_json` json DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Garantia de tipo decimal nas colunas monetárias ─────────────────────────
-- Se em produção alguma coluna estiver como float/double, converter para decimal.
-- Idempotente: só executa o ALTER se o DATA_TYPE atual não for 'decimal'.

-- bonus_final_rs
SET @col_type = (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'remuneracao_apuracao'
    AND COLUMN_NAME = 'bonus_final_rs'
);
SET @alter_sql = IF(
  @col_type IS NOT NULL AND @col_type != 'decimal',
  'ALTER TABLE remuneracao_apuracao MODIFY COLUMN bonus_final_rs decimal(15,2) DEFAULT NULL',
  'SELECT 1 -- bonus_final_rs já é decimal, nada a fazer'
);
PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- bonus_base_rs
SET @col_type2 = (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'remuneracao_apuracao'
    AND COLUMN_NAME = 'bonus_base_rs'
);
SET @alter_sql2 = IF(
  @col_type2 IS NOT NULL AND @col_type2 != 'decimal',
  'ALTER TABLE remuneracao_apuracao MODIFY COLUMN bonus_base_rs decimal(15,2) DEFAULT NULL',
  'SELECT 1 -- bonus_base_rs já é decimal, nada a fazer'
);
PREPARE stmt2 FROM @alter_sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- faturamento_real
SET @col_type3 = (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'remuneracao_apuracao'
    AND COLUMN_NAME = 'faturamento_real'
);
SET @alter_sql3 = IF(
  @col_type3 IS NOT NULL AND @col_type3 != 'decimal',
  'ALTER TABLE remuneracao_apuracao MODIFY COLUMN faturamento_real decimal(15,2) DEFAULT NULL',
  'SELECT 1 -- faturamento_real já é decimal, nada a fazer'
);
PREPARE stmt3 FROM @alter_sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
