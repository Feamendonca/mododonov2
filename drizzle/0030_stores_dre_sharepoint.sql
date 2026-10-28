-- Migration 0030: Config de DRE/SharePoint por loja (stores)
-- Postgres/Supabase. Idempotente. Colunas camelCase entre aspas (convenção da tabela stores).
-- Cada loja aponta pra sua pasta de DRE no SharePoint + um filtro de nome
-- (ex.: "Praça") pra desambiguar sub-unidades.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS "dreSharepointUrl" TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS "dreFileFilter" VARCHAR(120);
