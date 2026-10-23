-- Migration 0014: Migrar histórico de customer_occurrences → reviews
-- Transfere google_reviews e complaints para a tabela reviews (fonte única).
-- Apurações já APROVADAS não são afetadas (extrato_json congelado).
-- Idempotente: usa INSERT IGNORE para não duplicar em re-execução.

-- 1. Migrar google_reviews (type='google_review', rating não-nulo) → reviews com platform='google'
INSERT IGNORE INTO reviews (storeId, platform, stars, clientName, text, originalLink, reviewDate, status, tags)
SELECT
  storeId,
  'google' AS platform,
  rating AS stars,
  NULL AS clientName,
  description AS text,
  NULL AS originalLink,
  occurrenceDate AS reviewDate,
  CASE WHEN resolved = 1 THEN 'fechada' ELSE 'registrada' END AS status,
  NULL AS tags
FROM customer_occurrences
WHERE type = 'google_review' AND rating IS NOT NULL;

-- 2. Migrar complaints (type='complaint') → reviews com platform='manual', stars=1 (reclamação)
INSERT IGNORE INTO reviews (storeId, platform, stars, clientName, text, originalLink, reviewDate, status, tags)
SELECT
  storeId,
  'manual' AS platform,
  1 AS stars,
  NULL AS clientName,
  description AS text,
  NULL AS originalLink,
  occurrenceDate AS reviewDate,
  CASE
    WHEN resolved = 1 THEN 'fechada'
    ELSE 'registrada'
  END AS status,
  '["migrado_de_ocorrencias"]' AS tags
FROM customer_occurrences
WHERE type = 'complaint';

-- Nota: compliments e suggestions não são migrados (não alimentam a nota de qualidade).
-- A tabela customer_occurrences é mantida para referência histórica (não removida).
