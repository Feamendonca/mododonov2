-- Migration 0012: Criar tabela cron_executions para idempotência dos handlers de cron
-- Usada por todos os 6 handlers em server/scheduled/ para evitar execução dupla no mesmo ciclo.
-- UNIQUE(handler, run_date) garante que cada handler rode no máximo 1x por data.

CREATE TABLE IF NOT EXISTS `cron_executions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `handler` varchar(128) NOT NULL,
  `run_date` date NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cron_handler_date` (`handler`, `run_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
