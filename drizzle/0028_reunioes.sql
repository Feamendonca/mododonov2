-- Migration 0028: Módulo Reunião (cadência semanal)
CREATE TABLE IF NOT EXISTS reunioes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storeId INT NOT NULL,
  data VARCHAR(10) NOT NULL,
  participantes VARCHAR(300),
  observacao TEXT,
  createdBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reunioes_store_data (storeId, data)
);

CREATE TABLE IF NOT EXISTS reuniao_combinados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reuniaoId INT NOT NULL,
  storeId INT NOT NULL,
  descricao VARCHAR(500) NOT NULL,
  responsavel VARCHAR(150),
  prazo VARCHAR(10),
  status VARCHAR(10) NOT NULL DEFAULT 'aberto',
  medidaId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  concluidoAt TIMESTAMP NULL,
  INDEX idx_combinados_store_status (storeId, status),
  INDEX idx_combinados_reuniao (reuniaoId)
);
