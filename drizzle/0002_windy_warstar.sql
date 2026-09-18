CREATE TABLE `automation_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`relation` text DEFAULT '' NOT NULL,
	`before_value` text,
	`after_value` text,
	`rollback_action` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `automation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_automation_changes_run_id` ON `automation_changes` (`run_id`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`job_id` text NOT NULL,
	`operation` text DEFAULT 'execute' NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`related_run_id` text,
	`can_rollback` integer DEFAULT false NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_runs_job_id` ON `automation_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_automation_runs_employee_started` ON `automation_runs` (`employee_id`,`started_at`);