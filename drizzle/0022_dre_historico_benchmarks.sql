-- Migration 0022: dre_historico_mensal + benchmarks_agregados
-- Aplicada via webdev_execute_sql (TiDB, idempotente)

CREATE TABLE IF NOT EXISTS dre_historico_mensal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  ano_mes CHAR(7) NOT NULL COMMENT 'YYYY-MM',
  faturamento DECIMAL(14,2),
  cmv DECIMAL(14,2),
  folha DECIMAL(14,2),
  custos_fixos DECIMAL(14,2),
  custos_variaveis DECIMAL(14,2),
  impostos DECIMAL(14,2),
  ebitda DECIMAL(14,2),
  fonte ENUM('importado','dre_viva') NOT NULL DEFAULT 'importado',
  createdAt BIGINT NOT NULL DEFAULT 0,
  updatedAt BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_historico (store_id, ano_mes)
);

CREATE TABLE IF NOT EXISTS benchmarks_agregados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  segmento VARCHAR(64) NOT NULL COMMENT 'marca da loja ou rede',
  ano_mes CHAR(7) NOT NULL,
  metrica ENUM('cmv_pct','folha_pct','ebitda_pct','custos_fixos_pct') NOT NULL,
  p25 DECIMAL(8,4),
  mediana DECIMAL(8,4),
  p75 DECIMAL(8,4),
  n_lojas INT NOT NULL DEFAULT 0,
  gerado_em BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_benchmark (segmento, ano_mes, metrica)
);
