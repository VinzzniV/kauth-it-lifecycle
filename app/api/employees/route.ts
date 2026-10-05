import { env } from "cloudflare:workers";
import { and, desc, eq, exists, inArray, ne, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { auditEntries, automationChanges, automationLocks, automationRuns, employees, lifecycleEvents, masterData, services, workflowTasks } from "../../../db/schema";
import { applyMasterData, isoDate, type EmployeeRecord, type MasterDataItem } from "../../data";

const dateSchema = z.string().refine((value) => { try { return isoDate(value) === value; } catch { return false; } }, "Ungültiges Datum (JJJJ-MM-TT erwartet)");
const serviceSchema = z.object({ id: z.string().min(1), key: z.string(), label: z.string().min(1), category: z.string(), status: z.enum(["requested", "approved", "active", "remove", "removed"]), source: z.string(), details: z.string().optional() });
const taskSchema = z.object({ id: z.string().min(1), eventType: z.enum(["onboarding", "change", "offboarding"]), title: z.string().min(1), owner: z.string().min(1), executionType: z.enum(["manual", "simulated"]), status: z.enum(["open", "ready", "done"]), dueDate: dateSchema.nullable().optional(), completedAt: z.union([dateSchema, z.string().datetime()]).nullable().optional() });
const eventSchema = z.object({ id: z.string().min(1), type: z.enum(["onboarding", "change", "offboarding"]), status: z.string(), sourceFilename: z.string().min(1), importedAt: z.string().datetime() });
const employeeSchema = z.object({
  id: z.string().min(1), personnelNumber: z.string().trim().min(1).max(100), firstName: z.string().trim().min(1).max(200), lastName: z.string().trim().min(1).max(200), company: z.string(), department: z.string(), jobTitle: z.string(),
  status: z.enum(["pending", "active", "leaving", "inactive", "completed"]), startDate: dateSchema.nullable().optional(), endDate: dateSchema.nullable().optional(), directoryTargetOu: z.string().optional(), directoryReferenceUser: z.string().optional(), directoryReferenceStatus: z.string().optional(), directoryReferenceMessage: z.string().optional(), services: z.array(serviceSchema).max(200), tasks: z.array(taskSchema).max(200), events: z.array(eventSchema).length(1),
});

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  const message = error instanceof Error ? error.message : "Unbekannter Fehler";
  return message.includes("no such table") ? "Die Datenbank ist noch nicht vorbereitet." : message;
}
function omitFields<T extends object, K extends keyof T>(item: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...item };
  keys.forEach((key) => Reflect.deleteProperty(copy, key));
  return copy;
}

export async function GET() {
  try {
    const db = getDb();
    const people = await db.select().from(employees).orderBy(desc(employees.updatedAt));
    if (!people.length) return Response.json({ employees: [] });
    const ids = people.map((person) => person.id);
    const rules = await db.select().from(masterData) as MasterDataItem[];
    const [allServices, allTasks, allEvents, allRuns, allAudits] = await Promise.all([
      db.select().from(services).where(inArray(services.employeeId, ids)),
      db.select().from(workflowTasks).where(inArray(workflowTasks.employeeId, ids)),
      db.select().from(lifecycleEvents).where(inArray(lifecycleEvents.employeeId, ids)).orderBy(desc(lifecycleEvents.importedAt)),
      db.select().from(automationRuns).where(inArray(automationRuns.employeeId, ids)).orderBy(desc(automationRuns.startedAt)),
      db.select().from(auditEntries).where(inArray(auditEntries.employeeId, ids)).orderBy(desc(auditEntries.createdAt), desc(auditEntries.id)),
    ]);
    const runIds = allRuns.map((run) => run.id);
    const allChanges = runIds.length ? await db.select().from(automationChanges).where(inArray(automationChanges.runId, runIds)) : [];
    return Response.json({ employees: people.map((person) => applyMasterData({
      ...person,
      services: allServices.filter((item) => item.employeeId === person.id).map((item) => omitFields(item, "employeeId")),
      tasks: allTasks.filter((item) => item.employeeId === person.id && (!item.lifecycleEventId || item.lifecycleEventId === allEvents.find((event) => event.employeeId === person.id)?.id)).map((item) => omitFields(item, "employeeId")),
      events: allEvents.filter((item) => item.employeeId === person.id).map((item) => omitFields(item, "employeeId", "importDigest")),
      auditEntries: allAudits.filter((item) => item.employeeId === person.id).map((item) => omitFields(item, "employeeId")),
      automationRuns: allRuns.filter((item) => item.employeeId === person.id).map((run) => {
        const savedJob = JSON.parse(run.jobJson);
        const review = run.reviewJson ? JSON.parse(run.reviewJson) : {};
        const actionResults = (run.resultJson ? JSON.parse(run.resultJson).actionResults ?? [] : run.status === "review_required" || run.status === "reviewed" ? (JSON.parse(run.jobJson).actions ?? []).map((action: { type: string }) => ({ action: action.type, status: "review_required" })) : []).map((item: { action: string; status: string; error?: string }) => review[item.action] === "verified_no_effect" ? { ...item, status: "failed", error: "Manuell geprüft: keine externe Wirkung" } : item);
        const alreadyReversedChangeIds = allRuns.filter((candidate) => candidate.operation === "rollback" && candidate.mode === "Execute" && candidate.relatedRunId === run.id && candidate.resultJson).flatMap((candidate) => JSON.parse(candidate.resultJson!).changes.filter((change: { status: string }) => change.status === "completed").map((change: { sourceChangeId: string }) => change.sourceChangeId));
        return { ...omitFields(run, "employeeId", "jobJson", "resultJson"), alreadyReversedChangeIds, plannedActions: (savedJob.actions ?? []).map((action: { type: string; target?: string }) => ({ type: action.type, target: action.target ?? "" })), targetAccount: savedJob.directory?.userPrincipalName ?? savedJob.directory?.samAccountName ?? "", actionResults, changes: allChanges.filter((change) => change.runId === run.id).map((change) => omitFields(change, "runId")) };
      }),
    } as EmployeeRecord, rules)) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const input = employeeSchema.parse(await request.json());
    const db = getDb();
    const record = applyMasterData(input as EmployeeRecord, await db.select().from(masterData) as MasterDataItem[]);
    if (record.startDate) isoDate(record.startDate);
    if (record.endDate) isoDate(record.endDate);
    const [known] = await db.select().from(employees).where(eq(employees.personnelNumber, record.personnelNumber)).limit(1);
    const factual = { personnelNumber: record.personnelNumber, firstName: record.firstName, lastName: record.lastName, company: record.company, department: record.department, jobTitle: record.jobTitle, type: record.events[0].type, startDate: record.startDate ?? null, endDate: record.endDate ?? null, services: input.services.map(({ key, label, status }) => ({ key, label, status })).sort((a, b) => a.key.localeCompare(b.key)), tasks: input.tasks.map(({ title, owner, executionType, status }) => ({ title, owner, executionType, status })).sort((a, b) => a.title.localeCompare(b.title)) };
    const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(factual)));
    const importDigest = Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (known) {
      const [duplicate] = await db.select({ id: lifecycleEvents.id }).from(lifecycleEvents).where(and(eq(lifecycleEvents.employeeId, known.id), eq(lifecycleEvents.importDigest, importDigest))).limit(1);
      if (duplicate) return Response.json({ error: "Diese Laufkarte wurde inhaltlich bereits eingelesen." }, { status: 409 });
    }
    const storedId = known?.id ?? `emp-${record.personnelNumber}`;
    const importedReference = record.directoryReferenceUser?.trim();
    const referenceChanged = Boolean(importedReference && importedReference !== known?.directoryReferenceUser);
    if ((await db.select().from(automationLocks).where(eq(automationLocks.employeeId, storedId)).limit(1)).length) return Response.json({ error: "Import während eines laufenden oder ungeklärten Auftrags gesperrt." }, { status: 409 });
    const eventId = crypto.randomUUID();
    const editJobId = `edit-${crypto.randomUUID()}`;
    const statements: [Parameters<typeof db.batch>[0][number], ...Parameters<typeof db.batch>[0][number][]] = [db.insert(employees).values({
      id: storedId, personnelNumber: record.personnelNumber, firstName: record.firstName, lastName: record.lastName, company: record.company,
      department: record.department, jobTitle: record.jobTitle, status: record.status, startDate: record.startDate, endDate: record.endDate, directoryTargetOu: record.directoryTargetOu ?? "",
      directoryReferenceUser: record.directoryReferenceUser ?? "", directoryReferenceStatus: record.directoryReferenceStatus ?? "", directoryReferenceMessage: record.directoryReferenceMessage ?? "",
      shareToken: crypto.randomUUID().replaceAll("-", ""),
      shareExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({ target: employees.personnelNumber, set: {
      firstName: record.firstName, lastName: record.lastName, company: record.company, department: record.department, jobTitle: record.jobTitle,
      status: record.status, startDate: record.startDate, endDate: record.endDate, updatedAt: new Date().toISOString(),
      ...(referenceChanged ? { directoryReferenceUser: importedReference, directoryReferenceStatus: "pending", directoryReferenceMessage: "Referenzbenutzer durch HR-Import geändert; erneut prüfen.", directoryTargetOu: "" } : {}),
    }})];
    statements.push(db.insert(automationLocks).values({ employeeId: storedId, jobId: editJobId }));
    for (const event of record.events) statements.push(db.insert(lifecycleEvents).values({ ...event, importedAt: new Date().toISOString(), importDigest, id: eventId, employeeId: storedId }));
    const currentServices = known ? await db.select().from(services).where(eq(services.employeeId, known.id)) : [];
    for (const service of record.services) {
      const existing = currentServices.find((item) => item.key === service.key);
      if (existing) statements.push(db.update(services).set({ label: service.label, details: service.details ?? existing.details, source: service.source, status: record.events[0].type === "offboarding" ? service.status : existing.status === "active" ? "active" : service.status }).where(eq(services.id, existing.id)));
      else statements.push(db.insert(services).values({ ...service, id: crypto.randomUUID(), details: service.details ?? "", employeeId: storedId }));
    }
    for (const task of record.tasks) statements.push(db.insert(workflowTasks).values({ ...task, lifecycleEventId: eventId, id: crypto.randomUUID(), employeeId: storedId }));
    statements.push(db.insert(auditEntries).values({ employeeId: storedId, action: "Import", detail: `${record.events[0]?.sourceFilename || "Datei"} eingelesen` }));
    statements.push(db.delete(automationLocks).where(eq(automationLocks.jobId, editJobId)));
    await db.batch(statements);
    return Response.json({ ok: true, id: storedId }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed.*automation_locks/.test(error.message)) return Response.json({ error: "Die Akte wurde inzwischen für einen Auftrag gesperrt. Import nicht übernommen." }, { status: 409 });
    if (error instanceof Error && /UNIQUE constraint failed.*lifecycle_events/.test(error.message)) return Response.json({ error: "Diese Laufkarte wurde bereits eingelesen." }, { status: 409 });
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = z.union([
      z.object({ employeeId: z.string(), taskId: z.string(), status: z.enum(["open", "ready", "done"]) }),
      z.object({ employeeId: z.string(), directoryTargetOu: z.string().max(1000) }),
      z.object({ employeeId: z.string(), directoryReferenceUser: z.string().max(200) }),
      z.object({ employeeId: z.string(), shareAction: z.enum(["rotate", "revoke"]) }),
    ]).parse(await request.json());
    const db = getDb();
    if ("shareAction" in payload) {
      await db.batch([
        db.update(employees).set({ shareToken: payload.shareAction === "rotate" ? crypto.randomUUID().replaceAll("-", "") : "", shareExpiresAt: payload.shareAction === "rotate" ? new Date(Date.now() + 30 * 86400000).toISOString() : null }).where(eq(employees.id, payload.employeeId)),
        db.insert(auditEntries).values({ employeeId: payload.employeeId, action: "Statuslink", detail: payload.shareAction === "rotate" ? "Neu erstellt (30 Tage)" : "Widerrufen" }),
      ]);
      return Response.json({ ok: true });
    }
    if ("directoryReferenceUser" in payload) {
      const value = payload.directoryReferenceUser.trim();
      if (!value) return Response.json({ error: "Bitte einen Referenzbenutzer eingeben." }, { status: 400 });
      const editJobId = `edit-${crypto.randomUUID()}`;
      await db.batch([db.insert(automationLocks).values({ employeeId: payload.employeeId, jobId: editJobId }), db.update(employees).set({ directoryReferenceUser: value, directoryReferenceStatus: "pending", directoryReferenceMessage: "Prüfung ausstehend", directoryTargetOu: "", updatedAt: new Date().toISOString() }).where(eq(employees.id, payload.employeeId)), db.insert(auditEntries).values({ employeeId: payload.employeeId, action: "Referenzbenutzer aktualisiert", detail: value }), db.delete(automationLocks).where(eq(automationLocks.jobId, editJobId))]);
      return Response.json({ ok: true });
    }
    if ("directoryTargetOu" in payload) {
      const value = payload.directoryTargetOu.trim();
      const domain = (env as unknown as Record<string, string | undefined>).AD_DOMAIN || "kauth.local";
      const domainDn = domain.split(".").map((part) => `DC=${part}`).join(",");
      if (value && (!/^OU=.+,/i.test(value) || !value.toLowerCase().endsWith(`,${domainDn.toLowerCase()}`))) return Response.json({ error: `Die Ziel-OU muss ein vollständiger Distinguished Name in ${domain} sein.` }, { status: 400 });
      const editJobId = `edit-${crypto.randomUUID()}`;
      await db.batch([db.insert(automationLocks).values({ employeeId: payload.employeeId, jobId: editJobId }), db.update(employees).set({ directoryTargetOu: value, updatedAt: new Date().toISOString() }).where(eq(employees.id, payload.employeeId)), db.insert(auditEntries).values({ employeeId: payload.employeeId, action: "AD-Ziel-OU aktualisiert", detail: value || "Automatische Ermittlung" }), db.delete(automationLocks).where(eq(automationLocks.jobId, editJobId))]);
      return Response.json({ ok: true });
    }
    const [task] = await db.select().from(workflowTasks).where(and(eq(workflowTasks.id, payload.taskId), eq(workflowTasks.employeeId, payload.employeeId))).limit(1);
    if (!task) return Response.json({ error: "Aufgabe nicht gefunden." }, { status: 404 });
    const [latestEvent] = await db.select().from(lifecycleEvents).where(eq(lifecycleEvents.employeeId, payload.employeeId)).orderBy(desc(lifecycleEvents.importedAt)).limit(1);
    if (!latestEvent || (task.lifecycleEventId && task.lifecycleEventId !== latestEvent.id)) return Response.json({ error: "Historische Aufgaben sind unveränderlich. Bitte den aktuellen Vorgang verwenden." }, { status: 409 });
    const effective = applyMasterData({ tasks: [task], services: [], events: [latestEvent] } as unknown as EmployeeRecord, await db.select().from(masterData) as MasterDataItem[]).tasks[0];
    if (effective.executionType !== "manual") return Response.json({ error: "Automationsaufgaben werden nur durch geprüfte Ergebnisse abgeschlossen." }, { status: 403 });
    const assigned = await db.select().from(services).where(eq(services.employeeId, payload.employeeId));
    const editJobId = `edit-${crypto.randomUUID()}`;
    const statements: [Parameters<typeof db.batch>[0][number], ...Parameters<typeof db.batch>[0][number][]] = [
      db.insert(automationLocks).values({ employeeId: payload.employeeId, jobId: sql`CASE WHEN (SELECT id FROM lifecycle_events WHERE employee_id = ${payload.employeeId} ORDER BY imported_at DESC LIMIT 1) = ${latestEvent.id} THEN ${editJobId} ELSE NULL END` }),
      db.update(workflowTasks).set({ executionType: "manual", owner: effective.owner, status: payload.status, completedAt: payload.status === "done" ? new Date().toISOString() : null }).where(and(eq(workflowTasks.id, payload.taskId), eq(workflowTasks.employeeId, payload.employeeId))),
      db.insert(auditEntries).values({ employeeId: payload.employeeId, action: "Aufgabe aktualisiert", detail: `${task.title}: ${payload.status}` }),
    ];
    for (const service of assigned.filter((item) => task.title.toLowerCase() === item.label.toLowerCase() || task.title.toLowerCase() === `${item.label.toLowerCase()} bereitstellen`)) statements.push(db.update(services).set({ status: payload.status === "done" ? task.eventType === "offboarding" ? "removed" : "active" : task.eventType === "offboarding" ? "remove" : "requested" }).where(eq(services.id, service.id)));
    const unfinished = db.select({ id: workflowTasks.id }).from(workflowTasks).where(and(eq(workflowTasks.employeeId, payload.employeeId), eq(workflowTasks.lifecycleEventId, latestEvent.id), ne(workflowTasks.status, "done")));
    statements.push(db.update(lifecycleEvents).set({ status: "completed" }).where(and(eq(lifecycleEvents.id, latestEvent.id), notExists(unfinished))));
    statements.push(db.update(lifecycleEvents).set({ status: "in_review" }).where(and(eq(lifecycleEvents.id, latestEvent.id), exists(unfinished))));
    statements.push(db.update(employees).set({ status: "completed", updatedAt: new Date().toISOString() }).where(and(eq(employees.id, payload.employeeId), notExists(unfinished))));
    statements.push(db.update(employees).set({ status: latestEvent?.type === "offboarding" ? "leaving" : "pending", updatedAt: new Date().toISOString() }).where(and(eq(employees.id, payload.employeeId), eq(employees.status, "completed"), exists(unfinished))));
    statements.push(db.delete(automationLocks).where(eq(automationLocks.jobId, editJobId)));
    await db.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /NOT NULL constraint failed.*automation_locks/.test(error.message)) return Response.json({ error: "Der aktuelle Vorgang hat sich inzwischen geändert. Aufgabe nicht übernommen." }, { status: 409 });
    if (error instanceof Error && /UNIQUE constraint failed.*automation_locks/.test(error.message)) return Response.json({ error: "Änderung während eines laufenden oder ungeklärten Auftrags gesperrt." }, { status: 409 });
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { employeeId } = z.object({ employeeId: z.string().min(1) }).parse(await request.json());
    const db = getDb();
    const blocked = and(eq(automationRuns.employeeId, employeeId), eq(automationRuns.mode, "Execute"));
    const locked = eq(automationLocks.employeeId, employeeId);
    const safeToDelete = and(notExists(db.select({ id: automationLocks.employeeId }).from(automationLocks).where(locked)), notExists(db.select({ id: automationRuns.id }).from(automationRuns).where(blocked)));
    const [hasLock, executed] = await Promise.all([db.select().from(automationLocks).where(locked).limit(1), db.select().from(automationRuns).where(blocked).limit(1)]);
    if (hasLock.length || executed.length) return Response.json({ error: "Diese Akte enthält laufende oder ausgeführte Aufträge und muss für Prüfung, Wechsel und Offboarding erhalten bleiben. Abgeschlossene Vorgänge verschwinden automatisch aus der offenen Übersicht." }, { status: 409 });
    await db.batch([
      db.delete(auditEntries).where(and(eq(auditEntries.employeeId, employeeId), safeToDelete)),
      db.delete(automationChanges).where(and(inArray(automationChanges.runId, db.select({ id: automationRuns.id }).from(automationRuns).where(eq(automationRuns.employeeId, employeeId))), safeToDelete)),
      db.delete(automationRuns).where(and(eq(automationRuns.employeeId, employeeId), safeToDelete)),
      db.delete(workflowTasks).where(and(eq(workflowTasks.employeeId, employeeId), safeToDelete)),
      db.delete(services).where(and(eq(services.employeeId, employeeId), safeToDelete)),
      db.delete(lifecycleEvents).where(and(eq(lifecycleEvents.employeeId, employeeId), safeToDelete)),
      db.delete(employees).where(and(eq(employees.id, employeeId), safeToDelete)),
    ]);
    const [retained] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (retained) return Response.json({ error: "Die Akte wurde durch einen gleichzeitig gestarteten Auftrag geschützt und bleibt erhalten." }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 400 }); }
}
