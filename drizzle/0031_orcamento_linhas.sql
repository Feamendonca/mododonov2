-- Migration 0031: tabela orcamento_linhas (linhas do orçamento, espelha a DRE)
-- Postgres/Supabase. Idempotente. NÃO aplicar automaticamente — aplicada
-- manualmente no SQL editor do Supabase (mesmo padrão das migrations 0029/0030).

CREATE TABLE IF NOT EXISTS orcamento_linhas (
  id SERIAL PRIMARY KEY,
  orcamento_id INTEGER NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  label VARCHAR(160),
  nivel INTEGER,
  valor NUMERIC(14,2),
  ordem INTEGER,
  editavel BOOLEAN DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orc_linha
  ON orcamento_linhas (orcamento_id, codigo);
