CREATE TABLE `assets` (
	`id` serial NOT NULL,
	`name` varchar(191) NOT NULL,
	`category` enum('FURNITURE','COMPUTERS','LAPTOPS','ELECTRONICS','OTHER') NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`purchase_date` date,
	`unit_price` bigint NOT NULL DEFAULT 0,
	`condition` enum('NEW','GOOD','FAIR','POOR','BROKEN') NOT NULL DEFAULT 'GOOD',
	`location` varchar(191),
	`serial_number` varchar(191),
	`notes` text,
	`removed_date` date,
	`removal_reason` enum('SOLD','DISPOSED','LOST','GIVEN_AWAY'),
	`removal_value` bigint,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_months` (
	`id` serial NOT NULL,
	`period` char(7) NOT NULL,
	`income` bigint NOT NULL,
	`expenses` bigint NOT NULL,
	`payroll` bigint NOT NULL,
	`profit` bigint NOT NULL,
	`closed_at` datetime NOT NULL,
	`closed_by` bigint unsigned,
	CONSTRAINT `company_months_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_months_period_unique` UNIQUE(`period`)
);
--> statement-breakpoint
CREATE TABLE `partner_entries` (
	`id` serial NOT NULL,
	`partner_id` bigint unsigned NOT NULL,
	`entry_date` date NOT NULL,
	`type` enum('OPENING','PROFIT_SHARE','WITHDRAWAL','PERSONAL_EXPENSE','TRANSFER','ADJUSTMENT') NOT NULL,
	`amount` bigint NOT NULL,
	`description` varchar(512) NOT NULL,
	`period` char(7),
	`account_id` bigint unsigned,
	`transfer_group` varchar(36),
	`created_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partner_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_items` (
	`id` serial NOT NULL,
	`staff_id` bigint unsigned NOT NULL,
	`period` char(7) NOT NULL,
	`base_pay` bigint NOT NULL,
	`commission_base` bigint,
	`commission_amount` bigint,
	`commission_currency` char(3),
	`fx_rate` decimal(18,6),
	`fx_source` varchar(191),
	`bonus` bigint NOT NULL DEFAULT 0,
	`deductions` bigint NOT NULL DEFAULT 0,
	`advance` bigint NOT NULL DEFAULT 0,
	`net_pay` bigint NOT NULL,
	`notes` varchar(512),
	`paid_date` date,
	`paid_by_partner_id` bigint unsigned,
	`account_id` bigint unsigned,
	CONSTRAINT `payroll_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_staff_period_uq` UNIQUE(`staff_id`,`period`)
);
--> statement-breakpoint
CREATE TABLE `staff_members` (
	`id` serial NOT NULL,
	`name` varchar(191) NOT NULL,
	`job_title` varchar(191),
	`pay_type` enum('SALARY','COMMISSION') NOT NULL,
	`monthly_salary` bigint,
	`commission_bps` int,
	`commission_client_id` bigint unsigned,
	`commission_store_ids` json,
	`start_date` date,
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	CONSTRAINT `staff_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `partner_entries_idx` ON `partner_entries` (`partner_id`,`entry_date`);