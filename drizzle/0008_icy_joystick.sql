ALTER TABLE `employees` ADD `directory_object_guid` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `directory_sam_account_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `directory_upn` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD `lifecycle_event_id` text;
--> statement-breakpoint
UPDATE workflow_tasks SET lifecycle_event_id = (SELECT id FROM lifecycle_events WHERE employee_id = workflow_tasks.employee_id ORDER BY imported_at DESC LIMIT 1) WHERE lifecycle_event_id IS NULL;
--> statement-breakpoint
CREATE TRIGGER automation_plan_guard BEFORE INSERT ON automation_runs WHEN NEW.operation = 'execute' AND (json_extract(NEW.job_json, '$.lifecycleEventId') IS NOT (SELECT id FROM lifecycle_events WHERE employee_id = NEW.employee_id ORDER BY imported_at DESC LIMIT 1) OR json_extract(NEW.job_json, '$.employeeRevision') IS NOT (SELECT updated_at FROM employees WHERE id = NEW.employee_id)) BEGIN SELECT RAISE(ABORT, 'Employee plan changed; prepare again'); END;
--> statement-breakpoint
UPDATE lifecycle_events SET status = 'completed' WHERE EXISTS (SELECT 1 FROM workflow_tasks WHERE lifecycle_event_id = lifecycle_events.id) AND NOT EXISTS (SELECT 1 FROM workflow_tasks WHERE lifecycle_event_id = lifecycle_events.id AND status <> 'done');
--> statement-breakpoint
UPDATE employees SET status = 'completed' WHERE EXISTS (SELECT 1 FROM lifecycle_events WHERE id = (SELECT id FROM lifecycle_events WHERE employee_id = employees.id ORDER BY imported_at DESC LIMIT 1) AND status = 'completed');
