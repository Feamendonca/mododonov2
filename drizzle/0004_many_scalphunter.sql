ALTER TABLE `monthly_quality` MODIFY COLUMN `qualityGoogle` decimal(5,2);--> statement-breakpoint
ALTER TABLE `monthly_quality` MODIFY COLUMN `qualityAudit` decimal(5,2);--> statement-breakpoint
ALTER TABLE `monthly_quality` MODIFY COLUMN `qualityChecklist` decimal(5,2);--> statement-breakpoint
ALTER TABLE `stores` MODIFY COLUMN `qualityGoogle` decimal(5,2);--> statement-breakpoint
ALTER TABLE `stores` MODIFY COLUMN `qualityAudit` decimal(5,2);--> statement-breakpoint
ALTER TABLE `stores` MODIFY COLUMN `qualityChecklist` decimal(5,2);