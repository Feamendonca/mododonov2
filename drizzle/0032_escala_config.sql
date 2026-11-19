-- Migration 0032: tabelas de parâmetro do módulo de Escala (funcoes_loja,
-- escalas_catalogo, regras_escala) — catálogo legal da EC 141/2026.
-- Postgres/Supabase. Idempotente. Colunas camelCase entre aspas (mesma
-- convenção de employees/shift_blocks/store_people_config e da migration 0030).
--
-- drizzle-kit generate não pôde ser usado: os snapshots em drizzle/meta/
-- estão malformados/obsoletos (projeto migrou de MySQL/TiDB para Postgres
-- sem recriar os snapshots a partir da migration 0027). Esta migration foi
-- escrita à mão seguindo o formato das migrations 0027-0031.

-- ─── enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE funcoes_loja_driver AS ENUM ('tickets', 'pratos', 'cobertos');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE funcoes_loja_produtividade_origem AS ENUM (
    'sugerida_historico',
    'sugerida_benchmark',
    'definida_gestor'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE regras_escala_tipo AS ENUM ('DURA', 'MOLE', 'DEPENDE_CCT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── funcoes_loja ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funcoes_loja (
  id SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  nome VARCHAR(64) NOT NULL,
  driver funcoes_loja_driver NOT NULL,
  "produtividadeAlvo" NUMERIC(10,2),
  "produtividadeOrigem" funcoes_loja_produtividade_origem,
  "minPorBloco" INTEGER NOT NULL DEFAULT 0,
  "maxPorBloco" INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funcoes_loja_store_ativo
  ON funcoes_loja ("storeId", ativo);

-- ─── escalas_catalogo ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalas_catalogo (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(32) NOT NULL,
  nome VARCHAR(128) NOT NULL,
  "diasTrabalho" INTEGER NOT NULL,
  "diasFolga" INTEGER NOT NULL,
  "horasDiaPadrao" NUMERIC(5,2) NOT NULL,
  "horasSemanaMedia" NUMERIC(5,2) NOT NULL,
  "vigenciaInicio" DATE,
  "vigenciaFim" DATE,
  "exigeAcordoIndividual" BOOLEAN NOT NULL DEFAULT false,
  "exigeCCT" BOOLEAN NOT NULL DEFAULT false,
  "observacaoLegal" TEXT
);

-- ─── regras_escala ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regras_escala (
  id SERIAL PRIMARY KEY,
  "storeId" INTEGER,
  uf VARCHAR(2),
  cct VARCHAR(120),
  chave VARCHAR(64) NOT NULL,
  valor JSONB NOT NULL,
  tipo regras_escala_tipo NOT NULL,
  "vigenciaInicio" DATE,
  "vigenciaFim" DATE,
  fonte TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_regras_escala_store_chave_vigencia
  ON regras_escala ("storeId", chave, "vigenciaInicio");
