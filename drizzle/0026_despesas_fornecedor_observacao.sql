-- Migration 0026: Add fornecedor and observacao columns to despesas_mes
ALTER TABLE despesas_mes ADD COLUMN IF NOT EXISTS fornecedor VARCHAR(200) NULL AFTER descricao;
ALTER TABLE despesas_mes ADD COLUMN IF NOT EXISTS observacao VARCHAR(500) NULL AFTER fornecedor;
