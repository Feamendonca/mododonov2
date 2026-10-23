-- Migration 0015: Google Places API — nota de qualidade automática
-- Idempotente (IF NOT EXISTS / IF NOT EXISTS para colunas via information_schema)

-- 1. Adicionar googlePlaceId à tabela stores (idempotente)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stores'
    AND COLUMN_NAME = 'googlePlaceId'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE stores ADD COLUMN googlePlaceId VARCHAR(255) NULL AFTER sanitaryGate',
  'SELECT 1 -- googlePlaceId já existe'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Criar tabela google_ratings (snapshot mensal do Places API)
-- Guarda apenas o AGREGADO (rating + totalRatings) — NÃO persiste texto de reviews individuais (ToS Places API)
CREATE TABLE IF NOT EXISTS google_ratings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  storeId     INT NOT NULL,
  period      VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  rating      DECIMAL(2,1) NOT NULL COMMENT 'Média de estrelas do Google (ex: 4.3)',
  totalRatings INT NOT NULL COMMENT 'Total de avaliações no Google',
  nota        DECIMAL(5,2) NOT NULL COMMENT 'rating × 20 (0–100)',
  fetchedAt   BIGINT NOT NULL COMMENT 'Timestamp Unix ms da busca',
  UNIQUE KEY uq_google_rating (storeId, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
