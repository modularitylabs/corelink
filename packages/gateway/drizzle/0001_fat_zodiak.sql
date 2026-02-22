CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE audit_logs ADD `category` text;--> statement-breakpoint
ALTER TABLE credentials ADD `account_id` text;--> statement-breakpoint
ALTER TABLE policy_rules ADD `category` text;