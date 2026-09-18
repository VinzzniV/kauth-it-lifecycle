CREATE TABLE `master_data` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT 'IT' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_master_data_kind_active` ON `master_data` (`kind`,`active`);