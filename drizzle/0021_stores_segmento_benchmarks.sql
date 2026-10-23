-- Migration 0021: segmentação de lojas + tabela de benchmarks mensais
-- stores usa camelCase (confirmado no schema Drizzle)

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS segmento VARCHAR(50) NULL COMMENT 'Segmento operacional: massas, hamburgueria, japonesa, etc.',
  ADD COLUMN IF NOT EXISTS faixaFaturamento VARCHAR(20) NULL COMMENT 'Calculado automaticamente: ate_300k | 300k_600k | acima_600k';

-- Tabela de benchmarks mensais por grupo (segmento, faixa, rede)
CREATE TABLE IF NOT EXISTS dre_benchmarks_mensais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periodo VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  nivel VARCHAR(20) NOT NULL COMMENT 'segmento | faixa | rede',
  grupo VARCHAR(50) NOT NULL COMMENT 'valor do segmento/faixa ou "rede"',
  n_lojas INT NOT NULL DEFAULT 0,
  -- Métricas (mediana, P25, P75)
  cmv_pct_mediana DECIMAL(8,4),
  cmv_pct_p25 DECIMAL(8,4),
  cmv_pct_p75 DECIMAL(8,4),
  encargos_pct_mediana DECIMAL(8,4),
  encargos_pct_p25 DECIMAL(8,4),
  encargos_pct_p75 DECIMAL(8,4),
  receita_mediana DECIMAL(14,2),
  receita_p25 DECIMAL(14,2),
  receita_p75 DECIMAL(14,2),
  createdAt BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  updatedAt BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000),
  UNIQUE KEY uq_benchmark (periodo, nivel, grupo)
);
