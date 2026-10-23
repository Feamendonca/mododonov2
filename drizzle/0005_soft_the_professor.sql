ALTER TABLE `monthly_quality` ADD `googleFonte` enum('calculado','manual');--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `googleUpdatedBy` varchar(128);--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `googleUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `auditFonte` enum('calculado','manual');--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `auditUpdatedBy` varchar(128);--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `auditUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `checklistFonte` enum('calculado','manual');--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `checklistUpdatedBy` varchar(128);--> statement-breakpoint
ALTER TABLE `monthly_quality` ADD `checklistUpdatedAt` timestamp;