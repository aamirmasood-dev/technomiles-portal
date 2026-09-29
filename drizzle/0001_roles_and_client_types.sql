ALTER TABLE `clients` ADD `client_type` enum('MARKETPLACE','SERVICE','PROJECT') DEFAULT 'MARKETPLACE' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role` enum('ADMIN','STAFF') DEFAULT 'STAFF' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `active` boolean DEFAULT true NOT NULL;