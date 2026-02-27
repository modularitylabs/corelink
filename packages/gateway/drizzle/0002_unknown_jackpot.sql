CREATE TABLE `virtual_id_mappings` (
	`virtual_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`real_account_id` text NOT NULL,
	`provider_entity_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
