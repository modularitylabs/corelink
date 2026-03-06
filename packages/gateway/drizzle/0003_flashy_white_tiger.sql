CREATE TABLE `task_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`args` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`worker_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`completed_at` text,
	`timeout_at` text,
	`result` text,
	`error` text,
	`policy_decision` text,
	`approval_request_id` text,
	`redacted_fields` text
);
--> statement-breakpoint
CREATE INDEX `idx_session_status` ON `task_queue` (`session_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_status_priority` ON `task_queue` (`status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_worker` ON `task_queue` (`worker_id`);--> statement-breakpoint
CREATE INDEX `idx_cleanup` ON `task_queue` (`completed_at`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_reverse` ON `virtual_id_mappings` (`type`,`real_account_id`,`provider_entity_id`) WHERE "virtual_id_mappings"."type" = 'email' AND "virtual_id_mappings"."provider_entity_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_reverse` ON `virtual_id_mappings` (`type`,`real_account_id`) WHERE "virtual_id_mappings"."type" = 'account';--> statement-breakpoint
CREATE INDEX `idx_virtual_type` ON `virtual_id_mappings` (`virtual_id`,`type`);