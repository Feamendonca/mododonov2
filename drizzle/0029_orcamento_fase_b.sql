-- Migration 0029: Módulo Orçamento (Fase B) — metas diárias + colunas de "em atenção"
-- Idempotente: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Não apaga nada.

CREATE TABLE IF NOT EXISTS orcamento_metas_diarias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orcamento_id INT NOT NULL,
  store_id INT NOT NULL,
  data VARCHAR(10) NOT NULL COMMENT 'YYYY-MM-DD',
  meta_receita DECIMAL(14,2),
  meta_atendimentos INT NULL,
  peso_dia DECIMAL(8,4),
  UNIQUE KEY uq_meta_diaria (store_id, data)
);

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS em_atencao BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS prazo_decisao VARCHAR(10) NULL COMMENT 'YYYY-MM-DD';
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS decisao VARCHAR(20) NULL COMMENT "'seguir' | 'encerrar'";
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS rampa_meses INT NULL;
