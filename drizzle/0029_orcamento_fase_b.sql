-- Migration 0029: Orçamento Fase B — tabela metas_diarias + colunas em_atencao em orcamentos
-- Postgres/Supabase. Idempotente. Aplicada manualmente no SQL editor do Supabase.

CREATE TABLE IF NOT EXISTS orcamento_metas_diarias (
  id SERIAL PRIMARY KEY,
  orcamento_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  data VARCHAR(10) NOT NULL,
  meta_receita NUMERIC(14,2),
  meta_atendimentos INTEGER,
  peso_dia NUMERIC(8,4)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_diaria
  ON orcamento_metas_diarias (store_id, data);

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS em_atencao BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS prazo_decisao VARCHAR(10);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS decisao VARCHAR(20);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS rampa_meses INTEGER;
-- Folha (grupo 7 — Colaboradores). Distinta de pro_labore (grupo 13).
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS folha NUMERIC(14,2);

-- Aprovação (Task 5, Fase B) — admin ou supervisor (regional) aprova o rascunho.
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS aprovado_por INTEGER;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS aprovado_em BIGINT;
