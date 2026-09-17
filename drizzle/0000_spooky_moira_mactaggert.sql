CREATE TABLE `audit_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entries_employee_id` ON `audit_entries` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`personnel_number` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`job_title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start_date` text,
	`end_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_employees_personnel_number` ON `employees` (`personnel_number`);--> statement-breakpoint
CREATE TABLE `lifecycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'in_review' NOT NULL,
	`source_filename` text DEFAULT '' NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lifecycle_events_employee_id` ON `lifecycle_events` (`employee_id`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`service_key` text NOT NULL,
	`label` text NOT NULL,
	`category` text DEFAULT 'Anwendung' NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`source` text DEFAULT 'Import' NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_services_employee_id` ON `services` (`employee_id`);--> statement-breakpoint
CREATE TABLE `workflow_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`owner` text DEFAULT 'IT' NOT NULL,
	`execution_type` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_date` text,
	`completed_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_tasks_employee_status` ON `workflow_tasks` (`employee_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
