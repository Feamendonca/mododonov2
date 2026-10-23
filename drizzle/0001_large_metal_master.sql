CREATE TABLE `action_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`category` enum('cmv','experience','revenue','people','discipline','other') NOT NULL,
	`description` text NOT NULL,
	`reason` text,
	`dueDate` varchar(10),
	`responsible` varchar(128),
	`status` enum('todo','doing','done','failed','cancelled') DEFAULT 'todo',
	`result` text,
	`isSuggestion` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`period` varchar(7) NOT NULL,
	`signed` boolean DEFAULT false,
	`signedAt` timestamp,
	`signedBy` varchar(128),
	`reviewsTarget` int DEFAULT 30,
	`tableResponseHours` int DEFAULT 24,
	`googleResponseHours` int DEFAULT 48,
	`trainTeam` boolean DEFAULT false,
	`actOnStandard` boolean DEFAULT false,
	`joinCommunity` boolean DEFAULT false,
	`doPreShift` boolean DEFAULT false,
	`doAppEntry` boolean DEFAULT false,
	`doWeeklyMeeting` boolean DEFAULT false,
	`doInitialCount` boolean DEFAULT false,
	`doWeeklyCount` boolean DEFAULT false,
	`doMonthlyCount` boolean DEFAULT false,
	`readTrails` boolean DEFAULT false,
	`joinCouncil` boolean DEFAULT false,
	`applyContent` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commitments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_occurrences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`occurrenceDate` varchar(10) NOT NULL,
	`type` enum('complaint','compliment','suggestion','google_review') NOT NULL,
	`rating` int,
	`description` text NOT NULL,
	`actionTaken` text,
	`resolved` boolean DEFAULT false,
	`resolvedAt` timestamp,
	`linkedActionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_occurrences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`entryDate` varchar(10) NOT NULL,
	`revenue` decimal(12,2) DEFAULT '0',
	`invoices` decimal(12,2) DEFAULT '0',
	`extraLabor` decimal(12,2) DEFAULT '0',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_quality` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`period` varchar(7) NOT NULL,
	`qualityGoogle` decimal(5,2) DEFAULT '85',
	`qualityAudit` decimal(5,2) DEFAULT '85',
	`qualityChecklist` decimal(5,2) DEFAULT '85',
	`sanitaryGate` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_quality_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_counts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`countDate` varchar(10) NOT NULL,
	`totalValue` decimal(12,2) NOT NULL,
	`countType` enum('initial','weekly','monthly') DEFAULT 'weekly',
	`items` json DEFAULT ('[]'),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_counts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`unit` varchar(32) DEFAULT 'kg',
	`curve` enum('A','B','C') DEFAULT 'B',
	`avgCost` decimal(10,2) DEFAULT '0',
	`active` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`location` varchar(128),
	`managerName` varchar(128),
	`budgetRevenue` decimal(12,2) DEFAULT '0',
	`budgetCmvPct` decimal(5,2) DEFAULT '30',
	`budgetPackagingPct` decimal(5,2) DEFAULT '4',
	`budgetTaxesPct` decimal(5,2) DEFAULT '3',
	`budgetFixedCosts` decimal(12,2) DEFAULT '0',
	`dayWeights` json DEFAULT ('[110,80,90,95,100,110,115]'),
	`qualityGoogle` decimal(5,2) DEFAULT '85',
	`qualityAudit` decimal(5,2) DEFAULT '85',
	`qualityChecklist` decimal(5,2) DEFAULT '85',
	`sanitaryGate` boolean DEFAULT true,
	`gateAbsences` boolean DEFAULT true,
	`gateEvaluation` boolean DEFAULT true,
	`gateSanctions` boolean DEFAULT true,
	`active` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `trail_completions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`moduleId` varchar(64) NOT NULL,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trail_completions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storeId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_stores_id` PRIMARY KEY(`id`)
);
