CREATE TABLE `gatilhos_mensais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`storeId` int NOT NULL,
	`period` varchar(7) NOT NULL,
	`semFaltasInjustificadas` boolean,
	`avaliacaoDesempenho` decimal(4,2),
	`semSancoes` boolean,
	`fonte` enum('calculado','manual') DEFAULT 'manual',
	`updatedBy` varchar(128),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gatilhos_mensais_id` PRIMARY KEY(`id`)
);
