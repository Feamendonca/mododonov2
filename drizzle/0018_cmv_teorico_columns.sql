-- Migration 0018: Adicionar colunas de CMV Teórico (idempotente via ADD COLUMN IF NOT EXISTS — TiDB/MySQL 8)
-- stores.usaCmvTeorico: flag que ativa o modo CMV teórico para a loja
-- stock_periods: cmvTeoricoRs, cmvTeoricoReceita, cmvTeoricoPct, dispersaoRs, dispersaoPct
ALTER TABLE stores ADD COLUMN IF NOT EXISTS usaCmvTeorico TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE stock_periods ADD COLUMN IF NOT EXISTS cmvTeoricoRs DECIMAL(14,2) DEFAULT NULL;
ALTER TABLE stock_periods ADD COLUMN IF NOT EXISTS cmvTeoricoReceita DECIMAL(14,2) DEFAULT NULL;
ALTER TABLE stock_periods ADD COLUMN IF NOT EXISTS cmvTeoricoPct DECIMAL(8,4) DEFAULT NULL;
ALTER TABLE stock_periods ADD COLUMN IF NOT EXISTS dispersaoRs DECIMAL(14,2) DEFAULT NULL;
ALTER TABLE stock_periods ADD COLUMN IF NOT EXISTS dispersaoPct DECIMAL(8,4) DEFAULT NULL;
