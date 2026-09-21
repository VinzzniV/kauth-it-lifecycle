import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(), personnelNumber: text("personnel_number").notNull(),
  firstName: text("first_name").notNull(), lastName: text("last_name").notNull(),
  company: text("company").notNull().default(""), department: text("department").notNull().default(""),
  jobTitle: text("job_title").notNull().default(""), status: text("status").notNull().default("active"),
  directoryTargetOu: text("directory_target_ou").notNull().default(""),
  directoryReferenceUser: text("directory_reference_user").notNull().default(""),
  directoryReferenceStatus: text("directory_reference_status").notNull().default(""),
  directoryReferenceMessage: text("directory_reference_message").notNull().default(""),
  shareToken: text("share_token").notNull().default(""),
  startDate: text("start_date"), endDate: text("end_date"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_employees_personnel_number").on(table.personnelNumber)]);

export const services = sqliteTable("services", {
  id: text("id").primaryKey(), employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  key: text("service_key").notNull(), label: text("label").notNull(), category: text("category").notNull().default("Anwendung"),
  status: text("status").notNull().default("requested"), source: text("source").notNull().default("Import"), details: text("details").notNull().default(""),
}, (table) => [index("idx_services_employee_id").on(table.employeeId)]);

export const workflowTasks = sqliteTable("workflow_tasks", {
  id: text("id").primaryKey(), employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), title: text("title").notNull(), owner: text("owner").notNull().default("IT"),
  executionType: text("execution_type").notNull().default("manual"), status: text("status").notNull().default("open"),
  dueDate: text("due_date"), completedAt: text("completed_at"),
}, (table) => [index("idx_workflow_tasks_employee_status").on(table.employeeId, table.status)]);

export const lifecycleEvents = sqliteTable("lifecycle_events", {
  id: text("id").primaryKey(), employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: text("type").notNull(), status: text("status").notNull().default("in_review"), sourceFilename: text("source_filename").notNull().default(""),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_lifecycle_events_employee_id").on(table.employeeId)]);

export const auditEntries = sqliteTable("audit_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }), employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  action: text("action").notNull(), detail: text("detail").notNull().default(""), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_audit_entries_employee_id").on(table.employeeId)]);

export const automationRuns = sqliteTable("automation_runs", {
  id: text("id").primaryKey(), employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  jobId: text("job_id").notNull(), operation: text("operation").notNull().default("execute"), mode: text("mode").notNull(),
  status: text("status").notNull(), relatedRunId: text("related_run_id"), canRollback: integer("can_rollback", { mode: "boolean" }).notNull().default(false),
  startedAt: text("started_at").notNull(), completedAt: text("completed_at"), error: text("error").notNull().default(""),
}, (table) => [uniqueIndex("idx_automation_runs_job_id").on(table.jobId), index("idx_automation_runs_employee_started").on(table.employeeId, table.startedAt)]);

export const automationChanges = sqliteTable("automation_changes", {
  id: text("id").primaryKey(), runId: text("run_id").notNull().references(() => automationRuns.id, { onDelete: "cascade" }),
  action: text("action").notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(),
  relation: text("relation").notNull().default(""), beforeValue: text("before_value"), afterValue: text("after_value"),
  rollbackAction: text("rollback_action").notNull().default("manual"), status: text("status").notNull().default("completed"),
}, (table) => [index("idx_automation_changes_run_id").on(table.runId)]);

export const masterData = sqliteTable("master_data", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), label: text("label").notNull(), value: text("value").notNull().default(""),
  owner: text("owner").notNull().default("IT"), active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_master_data_kind_active").on(table.kind, table.active)]);
