-- Migration 0020: UNIQUE constraint em orcamentos (store_id, periodo_inicio)
-- Garante 1 orçamento por loja+mês. Sem duplicatas no banco (verificado antes de aplicar).
-- Idempotente: só adiciona se ainda não existir.

-- Verificar e adicionar UNIQUE KEY se não existir
-- TiDB/MySQL: usa ADD UNIQUE KEY IF NOT EXISTS via information_schema check
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'orcamentos'
    AND index_name = 'uq_orcamento_store_periodo'
);

-- Criar o índice único apenas se não existir
-- (TiDB suporta CREATE UNIQUE INDEX IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS uq_orcamento_store_periodo
  ON orcamentos (store_id, periodo_inicio);
