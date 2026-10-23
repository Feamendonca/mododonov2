-- Migration 0027: Central de Lançamentos — tabela caixa_diario (quebra de receita por forma de pagamento)
CREATE TABLE IF NOT EXISTS caixa_diario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storeId INT NOT NULL,
  data VARCHAR(10) NOT NULL, -- YYYY-MM-DD
  dinheiro DECIMAL(12,2) DEFAULT 0,
  debito DECIMAL(12,2) DEFAULT 0,
  credito DECIMAL(12,2) DEFAULT 0,
  vale DECIMAL(12,2) DEFAULT 0,
  pix DECIMAL(12,2) DEFAULT 0,
  apps DECIMAL(12,2) DEFAULT 0,
  atendimentos INT DEFAULT 0,
  createdBy INT NULL,
  createdAt BIGINT NOT NULL,
  updatedAt BIGINT NULL,
  UNIQUE KEY uq_store_data (storeId, data)
);
