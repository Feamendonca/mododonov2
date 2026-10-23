CREATE TABLE IF NOT EXISTS `purchase_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodId` int NOT NULL,
	`storeId` int NOT NULL,
	`supplier` varchar(255),
	`categoryId` int,
	`invoiceNumber` varchar(100),
	`invoiceDate` varchar(10),
	`totalValue` decimal(10,2) NOT NULL DEFAULT '0',
	`notes` text,
	`createdAt` timestamp DEFAULT (now()),
	CONSTRAINT `purchase_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodId` int NOT NULL,
	`productId` int NOT NULL,
	`storeId` int NOT NULL,
	`openingStock` decimal(10,3) DEFAULT '0',
	`purchases` decimal(10,3) DEFAULT '0',
	`closingStock` decimal(10,3) DEFAULT '0',
	`openingCost` decimal(10,2) DEFAULT '0',
	`purchasesCost` decimal(10,2) DEFAULT '0',
	`closingCost` decimal(10,2) DEFAULT '0',
	`alertFlags` json,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`weekNumber` int NOT NULL,
	`year` int NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`unit` varchar(50) NOT NULL DEFAULT 'KG',
	`unitCost` decimal(10,4) NOT NULL DEFAULT '0.0000',
	`curveABC` enum('A','B','C') NOT NULL DEFAULT 'B',
	`active` boolean NOT NULL DEFAULT true,
	`categoryId` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_products_id` PRIMARY KEY(`id`)
);
