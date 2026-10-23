-- Migration 0019: tabela despesas_mes para DRE Viva
-- Idempotente: CREATE TABLE IF NOT EXISTS
-- Categorias espelham as linhas do DRE do orçamento

CREATE TABLE IF NOT EXISTS despesas_mes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  storeId    INT NOT NULL,
  period     VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  categoria  VARCHAR(50) NOT NULL COMMENT 'folha|aluguel|marketing|impostos|royalties|outros_fixos|outros_variaveis|manutencao|energia|condominio|gas|agua|contabilidade|sistemas|sanitarismo|financeiras|pro_labore',
  valor      DECIMAL(14,2) NOT NULL,
  data       DATE NOT NULL,
  descricao  VARCHAR(500) NULL,
  fonte      VARCHAR(30) NOT NULL DEFAULT 'manual' COMMENT 'manual|manutencao|importacao',
  conferido  TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Para futura conciliação bancária',
  createdBy  INT NULL,
  createdAt  BIGINT NOT NULL,
  INDEX idx_despesas_store_period (storeId, period),
  INDEX idx_despesas_data (data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
