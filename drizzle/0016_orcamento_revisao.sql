-- Migration 0016: adicionar ia_revisao_json à tabela orcamentos (idempotente)
-- Armazena as decisões de revisão item-a-item da análise IA (A3)
-- Formato: JSON com sugestoesCorte[], linhasNovas[], questionamentos[] e suas decisões
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orcamentos'
  AND COLUMN_NAME = 'ia_revisao_json'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orcamentos ADD COLUMN ia_revisao_json MEDIUMTEXT NULL AFTER notas',
  'SELECT 1 -- ia_revisao_json já existe'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
