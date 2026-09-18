import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { auditEntries, automationChanges, automationRuns, employees, lifecycleEvents, services, workflowTasks } from "../../../db/schema";

const serviceSchema = z.object({ id: z.string(), key: z.string(), label: z.string(), category: z.string(), status: z.string(), source: z.string(), details: z.string().optional() });
const taskSchema = z.object({ id: z.string(), eventType: z.string(), title: z.string(), owner: z.string(), executionType: z.string(), status: z.string(), dueDate: z.string().nullable().optional(), completedAt: z.string().nullable().optional() });
const eventSchema = z.object({ id: z.string(), type: z.string(), status: z.string(), sourceFilename: z.string(), importedAt: z.string() });
const employeeSchema = z.object({
  id: z.string(), personnelNumber: z.string().min(1), firstName: z.string(), lastName: z.string(), company: z.string(), department: z.string(), jobTitle: z.string(),
  status: z.string(), startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(), directoryTargetOu: z.string().optional(), services: z.array(serviceSchema), tasks: z.array(taskSchema), events: z.array(eventSchema),
});

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unbekannter Fehler";
  return message.includes("no such table") ? "Die Datenbank ist noch nicht vorbereitet." : message;
}

export async function GET() {
  try {
    const db = getDb();
    const people = await db.select().from(employees).orderBy(desc(employees.updatedAt));
    if (!people.length) return Response.json({ employees: [] });
    const ids = people.map((person) => person.id);
    const [allServices, allTasks, allEvents, allRuns] = await Promise.all([
      db.select().from(services).where(inArray(services.employeeId, ids)),
      db.select().from(workflowTasks).where(inArray(workflowTasks.employeeId, ids)),
      db.select().from(lifecycleEvents).where(inArray(lifecycleEvents.employeeId, ids)).orderBy(desc(lifecycleEvents.importedAt)),
      db.select().from(automationRuns).where(inArray(automationRuns.employeeId, ids)).orderBy(desc(automationRuns.startedAt)),
    ]);
    const runIds = allRuns.map((run) => run.id);
    const allChanges = runIds.length ? await db.select().from(automationChanges).where(inArray(automationChanges.runId, runIds)) : [];
    return Response.json({ employees: people.map((person) => ({
      ...person,
      services: allServices.filter((item) => item.employeeId === person.id).map(({ employeeId: _, ...item }) => item),
      tasks: allTasks.filter((item) => item.employeeId === person.id).map(({ employeeId: _, ...item }) => item),
      events: allEvents.filter((item) => item.employeeId === person.id).map(({ employeeId: _, ...item }) => item),
      automationRuns: allRuns.filter((item) => item.employeeId === person.id).map(({ employeeId: _, ...run }) => ({ ...run, changes: allChanges.filter((change) => change.runId === run.id).map(({ runId: __, ...change }) => change) })),
    })) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const record = employeeSchema.parse(await request.json());
    const db = getDb();
    const [known] = await db.select().from(employees).where(eq(employees.personnelNumber, record.personnelNumber)).limit(1);
    if (known && record.events[0]?.sourceFilename) {
      const duplicate = await db.select({ id: lifecycleEvents.id }).from(lifecycleEvents).where(and(eq(lifecycleEvents.employeeId, known.id), eq(lifecycleEvents.sourceFilename, record.events[0].sourceFilename))).limit(1);
      if (duplicate.length) return Response.json({ error: "Diese Laufkarte wurde für den Mitarbeiter bereits eingelesen." }, { status: 409 });
    }
    await db.insert(employees).values({
      id: record.id, personnelNumber: record.personnelNumber, firstName: record.firstName, lastName: record.lastName, company: record.company,
      department: record.department, jobTitle: record.jobTitle, status: record.status, startDate: record.startDate, endDate: record.endDate, directoryTargetOu: record.directoryTargetOu ?? "",
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({ target: employees.personnelNumber, set: {
      firstName: record.firstName, lastName: record.lastName, company: record.company, department: record.department, jobTitle: record.jobTitle,
      status: record.status, startDate: record.startDate, endDate: record.endDate, updatedAt: new Date().toISOString(),
    }});
    const [stored] = await db.select().from(employees).where(eq(employees.personnelNumber, record.personnelNumber)).limit(1);
    const eventIds = record.events.map((item) => item.id);
    if (eventIds.length) await db.delete(lifecycleEvents).where(inArray(lifecycleEvents.id, eventIds));
    await db.insert(lifecycleEvents).values(record.events.map((item) => ({ ...item, employeeId: stored.id })));
    for (let index = 0; index < record.services.length; index += 8) {
      await db.insert(services).values(record.services.slice(index, index + 8).map((item) => ({ ...item, details: item.details ?? "", employeeId: stored.id }))).onConflictDoNothing();
    }
    for (let index = 0; index < record.tasks.length; index += 8) {
      await db.insert(workflowTasks).values(record.tasks.slice(index, index + 8).map((item) => ({ ...item, employeeId: stored.id }))).onConflictDoNothing();
    }
    await db.insert(auditEntries).values({ employeeId: stored.id, action: "Import", detail: `${record.events[0]?.sourceFilename || "Datei"} eingelesen` });
    return Response.json({ ok: true, id: stored.id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = z.union([
      z.object({ employeeId: z.string(), taskId: z.string(), status: z.enum(["open", "ready", "done"]) }),
      z.object({ employeeId: z.string(), directoryTargetOu: z.string().max(1000) }),
    ]).parse(await request.json());
    const db = getDb();
    if ("directoryTargetOu" in payload) {
      const value = payload.directoryTargetOu.trim();
      if (value && !/^OU=.+,DC=kauth,DC=local$/i.test(value)) return Response.json({ error: "Die Ziel-OU muss ein vollständiger Distinguished Name in kauth.local sein." }, { status: 400 });
      await db.update(employees).set({ directoryTargetOu: value, updatedAt: new Date().toISOString() }).where(eq(employees.id, payload.employeeId));
      await db.insert(auditEntries).values({ employeeId: payload.employeeId, action: "AD-Ziel-OU aktualisiert", detail: value || "Automatische Ermittlung" });
      return Response.json({ ok: true });
    }
    await db.update(workflowTasks).set({ status: payload.status, completedAt: payload.status === "done" ? new Date().toISOString() : null }).where(and(eq(workflowTasks.id, payload.taskId), eq(workflowTasks.employeeId, payload.employeeId)));
    const remaining = await db.select({ id: workflowTasks.id }).from(workflowTasks).where(and(eq(workflowTasks.employeeId, payload.employeeId), ne(workflowTasks.status, "done"))).limit(1);
    if (!remaining.length) {
      await db.update(employees).set({ status: "completed", updatedAt: new Date().toISOString() }).where(eq(employees.id, payload.employeeId));
    } else {
      const [latestEvent] = await db.select({ type: lifecycleEvents.type }).from(lifecycleEvents).where(eq(lifecycleEvents.employeeId, payload.employeeId)).orderBy(desc(lifecycleEvents.importedAt)).limit(1);
      await db.update(employees).set({ status: latestEvent?.type === "offboarding" ? "leaving" : "pending", updatedAt: new Date().toISOString() }).where(and(eq(employees.id, payload.employeeId), eq(employees.status, "completed")));
    }
    await db.insert(auditEntries).values({ employeeId: payload.employeeId, action: "Aufgabe aktualisiert", detail: `${payload.taskId}: ${payload.status}` });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { employeeId } = z.object({ employeeId: z.string().min(1) }).parse(await request.json());
    const db = getDb();
    await db.batch([
      db.delete(auditEntries).where(eq(auditEntries.employeeId, employeeId)),
      db.delete(automationChanges).where(inArray(automationChanges.runId, db.select({ id: automationRuns.id }).from(automationRuns).where(eq(automationRuns.employeeId, employeeId)))),
      db.delete(automationRuns).where(eq(automationRuns.employeeId, employeeId)),
      db.delete(workflowTasks).where(eq(workflowTasks.employeeId, employeeId)),
      db.delete(services).where(eq(services.employeeId, employeeId)),
      db.delete(lifecycleEvents).where(eq(lifecycleEvents.employeeId, employeeId)),
      db.delete(employees).where(eq(employees.id, employeeId)),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: errorMessage(error) }, { status: 400 }); }
}
