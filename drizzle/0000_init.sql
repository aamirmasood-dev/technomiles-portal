CREATE TABLE `business_settings` (
	`id` int NOT NULL,
	`name` varchar(191) NOT NULL,
	`address` text,
	`email` varchar(191),
	`phone` varchar(64),
	`website` varchar(191),
	`bank_details` text,
	`logo_data_url` mediumtext,
	`invoice_prefix` varchar(32) NOT NULL DEFAULT 'TM-',
	`next_invoice_number` int NOT NULL DEFAULT 1,
	`payment_terms_days` int NOT NULL DEFAULT 14,
	`invoice_footer` text,
	CONSTRAINT `business_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`currency` char(3) NOT NULL,
	`timezone` varchar(64) NOT NULL,
	`contact_name` varchar(191),
	`email` varchar(191),
	`billing_address` text,
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_terms` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`name` varchar(191) NOT NULL,
	`base_label` varchar(64) NOT NULL,
	`rate_bps` int NOT NULL,
	`fixed_fee` bigint NOT NULL DEFAULT 0,
	`deduction_groups` json NOT NULL,
	`include_shipping` boolean NOT NULL DEFAULT true,
	`include_tax` boolean NOT NULL DEFAULT false,
	`store_ids` json,
	`carry_forward_loss` boolean NOT NULL DEFAULT true,
	`effective_from` char(7) NOT NULL,
	`effective_to` char(7),
	CONSTRAINT `contract_terms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`rate_date` date NOT NULL,
	`base` char(3) NOT NULL,
	`quote` char(3) NOT NULL,
	`rate` decimal(18,8) NOT NULL,
	CONSTRAINT `fx_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `fx_uq` UNIQUE(`rate_date`,`base`,`quote`)
);
--> statement-breakpoint
CREATE TABLE `ledger_lines` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`external_id` varchar(191) NOT NULL,
	`order_id` bigint unsigned,
	`order_external_id` varchar(191),
	`posted_at` datetime NOT NULL,
	`category` enum('SALES','SHIPPING_CHARGED','TAX_COLLECTED','TAX_WITHHELD','REFUNDS','MARKETPLACE_FEES','FULFILLMENT_FEES','PAYMENT_FEES','SHIPPING_LABELS','ADVERTISING','SUBSCRIPTION','OTHER_FEES','REIMBURSEMENTS','ADJUSTMENTS') NOT NULL,
	`amount` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`description` varchar(512),
	`source_type` varchar(64),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledger_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_store_ext_uq` UNIQUE(`store_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `manual_expenses` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`store_id` bigint unsigned,
	`shipping_provider_id` bigint unsigned,
	`expense_date` date NOT NULL,
	`deduction_group` enum('REFUNDS','MARKETPLACE','PAYMENT','SHIPPING','ADVERTISING','SUBSCRIPTIONS','OTHER_PLATFORM','COGS','PURCHASES','OTHER_MANUAL') NOT NULL,
	`amount` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`description` varchar(512),
	`created_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `manual_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_costs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`supplier` varchar(191),
	`item_cost` bigint NOT NULL,
	`handling` bigint NOT NULL DEFAULT 0,
	`currency` char(3) NOT NULL,
	`notes` text,
	`updated_by` bigint unsigned,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_costs_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_costs_order_id_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`external_id` varchar(191) NOT NULL,
	`sku` varchar(191),
	`title` varchar(512),
	`quantity` int NOT NULL,
	`unit_price` bigint,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_items_order_ext_uq` UNIQUE(`order_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`external_id` varchar(191) NOT NULL,
	`order_number` varchar(191),
	`order_date` datetime NOT NULL,
	`status` varchar(64),
	`currency` char(3) NOT NULL,
	`total` bigint,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_store_ext_uq` UNIQUE(`store_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`store_id` bigint unsigned,
	`deduction_group` enum('REFUNDS','MARKETPLACE','PAYMENT','SHIPPING','ADVERTISING','SUBSCRIPTIONS','OTHER_PLATFORM','COGS','PURCHASES','OTHER_MANUAL') NOT NULL,
	`amount` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`description` varchar(512) NOT NULL,
	`start_month` char(7) NOT NULL,
	`end_month` char(7),
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `recurring_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shipping_providers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`name` varchar(191) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `shipping_providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `statement_adjustments` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`term_id` bigint unsigned NOT NULL,
	`source_period` char(7) NOT NULL,
	`applied_period` char(7) NOT NULL,
	`base_delta` bigint NOT NULL,
	`description` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `statement_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `statements` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`term_id` bigint unsigned NOT NULL,
	`period` char(7) NOT NULL,
	`currency` char(3) NOT NULL,
	`base` bigint NOT NULL,
	`amount_due` bigint NOT NULL,
	`loss_carried_out` bigint NOT NULL DEFAULT 0,
	`invoice_number` varchar(64) NOT NULL,
	`snapshot` json NOT NULL,
	`closed_at` datetime NOT NULL,
	`closed_by` bigint unsigned,
	CONSTRAINT `statements_id` PRIMARY KEY(`id`),
	CONSTRAINT `statements_uq` UNIQUE(`client_id`,`term_id`,`period`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`platform` enum('SHOPIFY','EBAY','AMAZON','WALMART') NOT NULL,
	`name` varchar(191) NOT NULL,
	`currency` char(3) NOT NULL,
	`region` varchar(32),
	`marketplace_id` varchar(64),
	`account_ref` varchar(191),
	`credentials_enc` text,
	`sync_start_date` date NOT NULL,
	`last_sync_at` datetime,
	`last_sync_status` enum('OK','ERROR','RUNNING'),
	`last_sync_message` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`store_id` bigint unsigned NOT NULL,
	`started_at` datetime NOT NULL,
	`finished_at` datetime,
	`status` enum('OK','ERROR','RUNNING') NOT NULL,
	`range_from` datetime,
	`range_to` datetime,
	`orders_upserted` int NOT NULL DEFAULT 0,
	`lines_upserted` int NOT NULL DEFAULT 0,
	`message` text,
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`last_login_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `ledger_posted_idx` ON `ledger_lines` (`store_id`,`posted_at`);--> statement-breakpoint
CREATE INDEX `manual_expenses_client_date_idx` ON `manual_expenses` (`client_id`,`expense_date`);--> statement-breakpoint
CREATE INDEX `orders_date_idx` ON `orders` (`order_date`);--> statement-breakpoint
CREATE INDEX `stores_client_idx` ON `stores` (`client_id`);--> statement-breakpoint
CREATE INDEX `sync_logs_store_idx` ON `sync_logs` (`store_id`,`started_at`);