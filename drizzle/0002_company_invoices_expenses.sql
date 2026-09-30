CREATE TABLE `billing_plans` (
	`id` serial NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`description` varchar(512) NOT NULL,
	`amount` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`billing_interval` enum('MONTHLY','YEARLY') NOT NULL,
	`next_due_date` date NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `billing_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_accounts` (
	`id` serial NOT NULL,
	`name` varchar(191) NOT NULL,
	`currency` char(3) NOT NULL,
	`opening_balance` bigint NOT NULL DEFAULT 0,
	`opening_date` date NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `company_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_expenses` (
	`id` serial NOT NULL,
	`expense_date` date NOT NULL,
	`category` enum('RENT','INTERNET','UTILITIES','SUBSCRIPTIONS','HARDWARE','OTHER') NOT NULL,
	`description` varchar(512) NOT NULL,
	`currency` char(3) NOT NULL,
	`amount` bigint NOT NULL,
	`pkr_amount` bigint NOT NULL,
	`paid_by_partner_id` bigint unsigned,
	`account_id` bigint unsigned,
	`recurring_id` bigint unsigned,
	`notes` text,
	`created_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_recurring_expenses` (
	`id` serial NOT NULL,
	`category` enum('RENT','INTERNET','UTILITIES','SUBSCRIPTIONS','HARDWARE','OTHER') NOT NULL,
	`description` varchar(512) NOT NULL,
	`amount` bigint NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `company_recurring_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` serial NOT NULL,
	`invoice_id` bigint unsigned NOT NULL,
	`description` varchar(512) NOT NULL,
	`amount` bigint NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `invoice_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` serial NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`invoice_number` varchar(64) NOT NULL,
	`issue_date` date NOT NULL,
	`due_date` date NOT NULL,
	`currency` char(3) NOT NULL,
	`amount` bigint NOT NULL,
	`pkr_rate` decimal(18,6),
	`statement_id` bigint unsigned,
	`period` char(7),
	`notes` text,
	`settled_at` datetime,
	`settled_note` varchar(512),
	`voided_at` datetime,
	`created_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoice_number_unique` UNIQUE(`invoice_number`),
	CONSTRAINT `invoices_statement_id_unique` UNIQUE(`statement_id`)
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` serial NOT NULL,
	`name` varchar(191) NOT NULL,
	`share_bps` int NOT NULL,
	`user_id` bigint unsigned,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `partners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` serial NOT NULL,
	`client_id` bigint unsigned,
	`invoice_id` bigint unsigned,
	`received_date` date NOT NULL,
	`currency` char(3) NOT NULL,
	`amount` bigint NOT NULL,
	`pkr_received` bigint NOT NULL,
	`account_id` bigint unsigned,
	`reference` varchar(191),
	`description` varchar(512),
	`created_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `company_expenses_date_idx` ON `company_expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`,`issue_date`);--> statement-breakpoint
CREATE INDEX `payments_date_idx` ON `payments` (`received_date`);--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);