CREATE TABLE `holiday_calendars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`holiday_date` varchar(10) NOT NULL,
	`name` varchar(128) NOT NULL,
	`event_type` enum('feriado','vespera','ponto_facultativo') NOT NULL DEFAULT 'feriado',
	`scope` enum('nacional','estadual','municipal') DEFAULT 'nacional',
	`uf` varchar(2),
	`municipio` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `holiday_calendars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `store_holiday_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`store_id` int NOT NULL,
	`rule_date` varchar(10) NOT NULL,
	`event_type` enum('feriado','vespera','ponto_facultativo') NOT NULL DEFAULT 'feriado',
	`multiplier` decimal(5,3) NOT NULL DEFAULT '1.000',
	`source` enum('ia','manual') DEFAULT 'ia',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_holiday_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','supervisor','gerente') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `daily_entries` ADD `atendimentos` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `stores` ADD `operationType` enum('aeroporto','mall','rua','corporativo','universitario') DEFAULT 'rua';