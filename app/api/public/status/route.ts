import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db";
import {
  automationChanges,
  automationRuns,
  auditEntries,
  employees,
  lifecycleEvents,
  services,
  workflowTasks,
} from "../../../../db/schema";

const tokenSchema = z.string().regex(/^[a-f0-9]{32}$/i);

async function findEmployee(token: string) {
  const db = getDb();
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.shareToken, token))
    .limit(1);
  return employee;
}

export async function GET(request: Request) {
  const token = tokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
  if (!token.success)
    return Response.json({ error: "Link ist ungültig." }, { status: 400 });
  const employee = await findEmployee(token.data);
  if (!employee)
    return Response.json({ error: "Vorgang wurde nicht gefunden." }, { status: 404 });

  const db = getDb();
  const [tasks, assignedServices, events, runs] = await Promise.all([
    db.select().from(workflowTasks).where(eq(workflowTasks.employeeId, employee.id)),
    db.select().from(services).where(eq(services.employeeId, employee.id)),
    db.select().from(lifecycleEvents).where(eq(lifecycleEvents.employeeId, employee.id)).orderBy(desc(lifecycleEvents.importedAt)),
    db.select().from(automationRuns).where(eq(automationRuns.employeeId, employee.id)).orderBy(desc(automationRuns.startedAt)),
  ]);
  const runIds = runs.map((run) => run.id);
  const changes = runIds.length
    ? await db.select().from(automationChanges).where(inArray(automationChanges.runId, runIds))
    : [];

  return Response.json({
    employee: {
      personnelNumber: employee.personnelNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department,
      jobTitle: employee.jobTitle,
      status: employee.status,
      startDate: employee.startDate,
      endDate: employee.endDate,
      tasks: tasks.map((task) => ({ id: task.id, eventType: task.eventType, title: task.title, owner: task.owner, executionType: task.executionType, status: task.status, dueDate: task.dueDate, completedAt: task.completedAt })),
      services: assignedServices.map((service) => ({ id: service.id, key: service.key, label: service.label, category: service.category, status: service.status, source: service.source, details: service.details })),
      events: events.map((event) => ({ id: event.id, type: event.type, status: event.status, sourceFilename: event.sourceFilename, importedAt: event.importedAt })),
      automationRuns: runs.map((run) => ({
        id: run.id, jobId: run.jobId, operation: run.operation, mode: run.mode, status: run.status, relatedRunId: run.relatedRunId, canRollback: run.canRollback, startedAt: run.startedAt, completedAt: run.completedAt,
        changes: changes
          .filter((change) => change.runId === run.id)
          .map((change) => ({ id: change.id, action: change.action, resourceType: change.resourceType, resourceId: change.resourceId, relation: change.relation, afterValue: change.afterValue, status: change.status })),
      })),
    },
  });
}

export async function PATCH(request: Request) {
  const payload = z.object({
    token: tokenSchema,
    taskId: z.string().min(1),
    done: z.boolean(),
  }).parse(await request.json());
  const employee = await findEmployee(payload.token);
  if (!employee)
    return Response.json({ error: "Vorgang wurde nicht gefunden." }, { status: 404 });

  const db = getDb();
  const [task] = await db.select().from(workflowTasks).where(and(
    eq(workflowTasks.id, payload.taskId),
    eq(workflowTasks.employeeId, employee.id),
  )).limit(1);
  if (!task)
    return Response.json({ error: "Aufgabe wurde nicht gefunden." }, { status: 404 });
  if (task.executionType !== "manual")
    return Response.json({ error: "Automatisierte Aufgaben können hier nicht geändert werden." }, { status: 403 });

  await db.update(workflowTasks).set({
    status: payload.done ? "done" : "open",
    completedAt: payload.done ? new Date().toISOString() : null,
  }).where(eq(workflowTasks.id, task.id));
  const [remaining] = await db.select({ id: workflowTasks.id }).from(workflowTasks).where(and(
    eq(workflowTasks.employeeId, employee.id),
    eq(workflowTasks.status, "open"),
  )).limit(1);
  if (!remaining) {
    const [ready] = await db.select({ id: workflowTasks.id }).from(workflowTasks).where(and(
      eq(workflowTasks.employeeId, employee.id),
      eq(workflowTasks.status, "ready"),
    )).limit(1);
    if (!ready)
      await db.update(employees).set({ status: "completed", updatedAt: new Date().toISOString() }).where(eq(employees.id, employee.id));
  } else if (!payload.done && employee.status === "completed") {
    const [latestEvent] = await db.select({ type: lifecycleEvents.type }).from(lifecycleEvents).where(eq(lifecycleEvents.employeeId, employee.id)).orderBy(desc(lifecycleEvents.importedAt)).limit(1);
    await db.update(employees).set({
      status: latestEvent?.type === "offboarding" ? "leaving" : "pending",
      updatedAt: new Date().toISOString(),
    }).where(eq(employees.id, employee.id));
  }
  await db.insert(auditEntries).values({
    employeeId: employee.id,
    action: "Aufgabe über Statuslink aktualisiert",
    detail: `${task.title}: ${payload.done ? "erledigt" : "offen"}`,
  });

  return Response.json({ ok: true });
}
