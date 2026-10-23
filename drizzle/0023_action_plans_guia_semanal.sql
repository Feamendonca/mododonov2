-- Migration 0023: Adicionar colunas de guia semanal em action_plans
-- Aplicado em produção via webdev_execute_sql
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS semanaInicio TINYINT NULL COMMENT '1-4: semana do mês em que a ação começa';
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS checkpointNumerico VARCHAR(512) NULL COMMENT 'Número que o gerente olha para saber se está funcionando';
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS acaoSeEstourar VARCHAR(512) NULL COMMENT 'O que fazer se o checkpoint estourar';
