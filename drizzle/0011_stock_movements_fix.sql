-- Migration 0011: Corrigir stock_movements — UNIQUE(periodId,productId) + colunas GENERATED
-- Idempotente: cada passo consulta information_schema antes de executar.
-- Deve ser rodada APÓS 0010 (que cria a tabela).

-- ─── Passo 1: Dedupe preventivo ───────────────────────────────────────────────
-- Mantém a linha de maior id por (periodId, productId) e apaga as demais.
-- Seguro mesmo se não houver duplicatas.
DELETE sm
FROM stock_movements sm
INNER JOIN (
  SELECT periodId, productId, MAX(id) AS keep_id
  FROM stock_movements
  GROUP BY periodId, productId
  HAVING COUNT(*) > 1
) dup ON sm.periodId = dup.periodId AND sm.productId = dup.productId AND sm.id < dup.keep_id;

-- ─── Passo 2: UNIQUE key (idempotente via stored procedure) ───────────────────
-- MySQL 8 não tem ADD INDEX IF NOT EXISTS; usamos PROCEDURE + DROP PROCEDURE.
DROP PROCEDURE IF EXISTS _mig_0011_add_unique;
CREATE PROCEDURE _mig_0011_add_unique()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'stock_movements'
      AND index_name = 'uq_stock_movement'
  ) THEN
    ALTER TABLE stock_movements
      ADD UNIQUE KEY uq_stock_movement (periodId, productId);
  END IF;
END;
CALL _mig_0011_add_unique();
DROP PROCEDURE IF EXISTS _mig_0011_add_unique;

-- ─── Passo 3a: coluna consumption GENERATED ───────────────────────────────────
DROP PROCEDURE IF EXISTS _mig_0011_add_consumption;
CREATE PROCEDURE _mig_0011_add_consumption()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'stock_movements'
      AND column_name = 'consumption'
  ) THEN
    ALTER TABLE stock_movements
      ADD COLUMN consumption DECIMAL(10,3) GENERATED ALWAYS AS (
        COALESCE(openingStock, 0) + COALESCE(purchases, 0) - COALESCE(closingStock, 0)
      ) STORED;
  END IF;
END;
CALL _mig_0011_add_consumption();
DROP PROCEDURE IF EXISTS _mig_0011_add_consumption;

-- ─── Passo 3b: coluna cmvValue GENERATED ──────────────────────────────────────
DROP PROCEDURE IF EXISTS _mig_0011_add_cmvvalue;
CREATE PROCEDURE _mig_0011_add_cmvvalue()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'stock_movements'
      AND column_name = 'cmvValue'
  ) THEN
    ALTER TABLE stock_movements
      ADD COLUMN cmvValue DECIMAL(10,2) GENERATED ALWAYS AS (
        COALESCE(openingCost, 0) + COALESCE(purchasesCost, 0) - COALESCE(closingCost, 0)
      ) STORED;
  END IF;
END;
CALL _mig_0011_add_cmvvalue();
DROP PROCEDURE IF EXISTS _mig_0011_add_cmvvalue;
