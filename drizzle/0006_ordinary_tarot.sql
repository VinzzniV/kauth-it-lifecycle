CREATE TABLE `automation_actions` (
	`key` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`event_id` text NOT NULL,
	`action` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automation_locks` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_locks_job_id_unique` ON `automation_locks` (`job_id`);--> statement-breakpoint
CREATE TABLE `automation_receipts` (
	`job_id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `automation_runs`(`job_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `automation_changes` ADD `member_id` text;--> statement-breakpoint
ALTER TABLE `automation_runs` ADD `job_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `automation_runs` ADD `result_json` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `share_expires_at` text;--> statement-breakpoint
ALTER TABLE `lifecycle_events` ADD `import_digest` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lifecycle_events_import_digest` ON `lifecycle_events` (`employee_id`,`import_digest`);
--> statement-breakpoint
CREATE TRIGGER automation_claim_guard BEFORE INSERT ON automation_actions WHEN EXISTS (SELECT 1 FROM automation_actions WHERE key = NEW.key AND status NOT IN ('failed','rolled_back')) BEGIN SELECT RAISE(ABORT, 'Action already claimed'); END;
--> statement-breakpoint
UPDATE employees SET share_expires_at = datetime('now', '+30 days') WHERE share_token <> '';
