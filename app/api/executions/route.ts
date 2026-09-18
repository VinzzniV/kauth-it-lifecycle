import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { auditEntries, automationChanges, automationRuns, employees, lifecycleEvents, workflowTasks } from "../../../db/schema";
import { forwardToManagementAgent } from "../../../lib/management-agent";

const changeSchema = z.object({
  id: z.string().optional(), action: z.string(), resourceType: z.string(), resourceId: z.string(), relation: z.string().default(""),
  beforeValue: z.unknown().optional(), afterValue: z.unknown().optional(), rollbackAction: z.string().default("manual"), status: z.string().default("completed"),
});
const resultSchema = z.object({
  schemaVersion: z.literal(1), runId: z.string(), jobId: z.string(), employeeId: z.string(), operation: z.enum(["execute", "rollback"]),
  mode: z.enum(["WhatIf", "Execute"]), status: z.enum(["completed", "partial", "failed"]), relatedRunId: z.string().nullable().optional(),
  startedAt: z.string(), completedAt: z.string(), error: z.string().optional(), automationTaskIds: z.array(z.string()).default([]), changes: z.array(changeSchema).default([]),
});
const jsonValue = (value: unknown) => value === undefined ? null : JSON.stringify(value);

export async function POST(request: Request) {
  try {
    const runtime = env as unknown as Record<string, string | undefined>;
    const sameOrigin = request.headers.get("origin") === new URL(request.url).origin;
    if (runtime.MANAGEMENT_AGENT_TOKEN && !sameOrigin && request.headers.get("authorization") !== `Bearer ${runtime.MANAGEMENT_AGENT_TOKEN}`) return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
    const result = resultSchema.parse(await request.json());
    const db = getDb();
    const canRollback = result.operation === "execute" && result.mode === "Execute" && ["completed", "partial"].includes(result.status) && result.changes.some((change) => change.rollbackAction !== "manual");
    await db.insert(automationRuns).values({
      id: result.runId, employeeId: result.employeeId, jobId: result.jobId, operation: result.operation, mode: result.mode, status: result.status,
      relatedRunId: result.relatedRunId ?? null, canRollback, startedAt: result.startedAt, completedAt: result.completedAt, error: result.error ?? "",
    }).onConflictDoUpdate({ target: automationRuns.id, set: { status: result.status, canRollback, completedAt: result.completedAt, error: result.error ?? "" } });
    await db.delete(automationChanges).where(eq(automationChanges.runId, result.runId));
    for (let index = 0; index < result.changes.length; index += 12) {
      await db.insert(automationChanges).values(result.changes.slice(index, index + 12).map((change, offset) => ({
        id: change.id ?? `${result.runId}-${index + offset}`, runId: result.runId, action: change.action, resourceType: change.resourceType,
        resourceId: change.resourceId, relation: change.relation, beforeValue: jsonValue(change.beforeValue), afterValue: jsonValue(change.afterValue),
        rollbackAction: change.rollbackAction, status: change.status,
      })));
    }
    if (result.operation === "rollback" && result.relatedRunId && result.status === "completed") {
      await db.update(automationRuns).set({ canRollback: false, status: "rolled_back" }).where(eq(automationRuns.id, result.relatedRunId));
      await db.update(workflowTasks).set({ status: "ready", completedAt: null }).where(and(eq(workflowTasks.employeeId, result.employeeId), eq(workflowTasks.executionType, "simulated")));
      const [latestEvent] = await db.select({ type: lifecycleEvents.type }).from(lifecycleEvents).where(eq(lifecycleEvents.employeeId, result.employeeId)).orderBy(desc(lifecycleEvents.importedAt)).limit(1);
      await db.update(employees).set({ status: latestEvent?.type === "offboarding" ? "leaving" : "pending", updatedAt: result.completedAt }).where(eq(employees.id, result.employeeId));
    }
    if (result.operation === "execute" && result.mode === "Execute" && result.status === "completed" && result.automationTaskIds.length) {
      await db.update(workflowTasks).set({ status: "done", completedAt: result.completedAt }).where(and(eq(workflowTasks.employeeId, result.employeeId), inArray(workflowTasks.id, result.automationTaskIds)));
    }
    const remaining = await db.select({ id: workflowTasks.id }).from(workflowTasks).where(and(eq(workflowTasks.employeeId, result.employeeId), ne(workflowTasks.status, "done"))).limit(1);
    if (result.operation === "execute" && !remaining.length) await db.update(employees).set({ status: "completed", updatedAt: result.completedAt }).where(eq(employees.id, result.employeeId));
    await db.insert(auditEntries).values({ employeeId: result.employeeId, action: result.operation === "rollback" ? "Automation zurückgenommen" : "Automation ausgeführt", detail: `${result.jobId}: ${result.status}` });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ergebnis konnte nicht gespeichert werden." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const { runId, mode } = z.object({ runId: z.string(), mode: z.enum(["WhatIf", "Execute"]).default("Execute") }).parse(await request.json());
    const db = getDb();
    const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, runId)).limit(1);
    if (!run || run.operation !== "execute" || !run.canRollback) return Response.json({ error: "Für diese Ausführung ist kein Rollback verfügbar." }, { status: 409 });
    const [person, changes] = await Promise.all([
      db.select().from(employees).where(eq(employees.id, run.employeeId)).limit(1).then((rows) => rows[0]),
      db.select().from(automationChanges).where(eq(automationChanges.runId, run.id)),
    ]);
    if (!person) return Response.json({ error: "Mitarbeiterakte wurde nicht gefunden." }, { status: 404 });
    const rollbackJobId = `rollback-${run.jobId}-${Date.now()}`;
    const recordedUser = changes.find((change) => change.resourceType === "AD-Benutzer" && !change.resourceId.includes(","))?.resourceId;
    const fallbackUser = `${person.firstName}.${person.lastName}`.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.-]/g, "");
    const rollbackJob = { schemaVersion: 1, operation: "rollback", runId: rollbackJobId, jobId: rollbackJobId, requestedMode: mode, lifecycleType: "change", person: { employeeId: person.id, personnelNumber: person.personnelNumber, displayName: `${person.firstName} ${person.lastName}` }, directory: { domain: "kauth.local", samAccountName: recordedUser ?? fallbackUser }, automationTaskIds: [], originalRun: { id: run.id, changes } };
    await forwardToManagementAgent(rollbackJob);
    await db.insert(automationRuns).values({ id: rollbackJob.jobId, employeeId: person.id, jobId: rollbackJob.jobId, operation: "rollback", mode, status: "queued", relatedRunId: run.id, canRollback: false, startedAt: new Date().toISOString(), error: "" });
    return Response.json({ ok: true, jobId: rollbackJob.jobId });
  } catch (error) { const message = error instanceof Error ? error.message : "Rollback konnte nicht gestartet werden."; return Response.json({ error: message }, { status: message.includes("Management-Agent") ? 503 : 400 }); }
}
