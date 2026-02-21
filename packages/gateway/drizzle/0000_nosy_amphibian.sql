CREATE TABLE `active_providers` (
	`category` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`plugin_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`args` text NOT NULL,
	`rule_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_args` text,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`agent_name` text NOT NULL,
	`agent_version` text,
	`plugin_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input_args` text NOT NULL,
	`policy_action` text NOT NULL,
	`policy_rule_id` text,
	`redacted_fields` text,
	`policy_reason` text,
	`status` text NOT NULL,
	`error_message` text,
	`execution_time_ms` integer NOT NULL,
	`data_summary` text NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`type` text NOT NULL,
	`encrypted_data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugin_settings` (
	`plugin_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`settings` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `policy_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text,
	`action` text NOT NULL,
	`condition` text NOT NULL,
	`description` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redaction_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pattern` text NOT NULL,
	`replacement` text DEFAULT '[REDACTED]' NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
