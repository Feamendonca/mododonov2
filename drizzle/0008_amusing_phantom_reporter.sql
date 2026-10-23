CREATE TABLE IF NOT EXISTS `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`role` varchar(64) NOT NULL,
	`salaryBase` decimal(10,2) NOT NULL DEFAULT '0',
	`transportAllowance` decimal(10,2) NOT NULL DEFAULT '0',
	`mealAllowance` decimal(10,2) NOT NULL DEFAULT '0',
	`otherBenefits` decimal(10,2) NOT NULL DEFAULT '0',
	`hoursPerMonth` int NOT NULL DEFAULT 220,
	`hireDate` date NOT NULL,
	`status` enum('active','probation','inactive') NOT NULL DEFAULT 'active',
	`papelRemuneravel` enum('nenhum','gestor','lider') NOT NULL DEFAULT 'nenhum',
	`userId` int,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hourly_revenue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`revenueDate` date NOT NULL,
	`hour` int NOT NULL,
	`revenue` decimal(10,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hourly_revenue_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_hourly_revenue` UNIQUE(`storeId`,`revenueDate`,`hour`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`shiftBlockId` int NOT NULL,
	`employeeId` int NOT NULL,
	`workDate` date NOT NULL,
	`createdAt` timestamp DEFAULT (now()),
	CONSTRAINT `schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_schedule` UNIQUE(`storeId`,`shiftBlockId`,`employeeId`,`workDate`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `shift_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`startHour` int NOT NULL,
	`endHour` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`employeeId` int NOT NULL,
	`movementType` enum('hire','termination','role_change','salary_change') NOT NULL,
	`movementDate` date NOT NULL,
	`reason` text,
	`previousValue` varchar(256),
	`newValue` varchar(256),
	`createdAt` timestamp DEFAULT (now()),
	CONSTRAINT `staff_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_people_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`chargesPercent` decimal(5,2) NOT NULL DEFAULT '70.00',
	`productivityTarget` decimal(10,2) NOT NULL DEFAULT '200.00',
	`payrollTargetPercent` decimal(5,2) NOT NULL DEFAULT '18.00',
	`hiringCost` decimal(10,2) NOT NULL DEFAULT '1500.00',
	`operationStartHour` int NOT NULL DEFAULT 8,
	`operationEndHour` int NOT NULL DEFAULT 23,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_people_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_people_config_storeId_unique` UNIQUE(`storeId`)
);
