import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { auditEntries, employees, lifecycleEvents, services, workflowTasks } from "../../../db/schema";

const serviceSchema = z.object({ id: z.string(), key: z.string(), label: z.string(), category: z.string(), status: z.string(), source: z.string(), details: z.string().optional() });
const taskSchema = z.object({ id: z.string(), eventType: z.string(), title: z.string(), owner: z.string(), executionType: z.string(), status: z.string(), dueDate: z.string().nullable().optional(), completedAt: z.string().nullable().optional() });
const eventSchema = z.object({ id: z.string(), type: z.string(), status: z.string(), sourceFilename: z.string(), importedAt: z.string() });
const employeeSchema = z.object({
  id: z.string(), personnelNumber: z.string().min(1), firstName: z.string(), lastName: z.string(), company: z.string(), department: z.string(), jobTitle: z.string(),
  status: z.string(), startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(), services: z.array(serviceSchema), tasks: z.array(taskSchema), events: z.array(eventSchema),
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
    const [allServices, allTasks, allEvents] = await Promise.all([
      db.select().from(services).where(inArray(services.employeeId, ids)),
      db.select().from(workflowTasks).where(inArray(workflowTasks.employeeId, ids)),
      db.select().from(lifecycleEvents).where(inArray(lifecycleEvents.employeeId, ids)).orderBy(desc(lifecycleEvents.importedAt)),
    ]);
    return Response.json({ employees: people.map((person) => ({
      ...person,
      services: allServices.filter((item) => item.employeeId === person.id).map(({ employeeId: _, ...item }) => item),
      tasks: allTasks.filter((item) => item.employeeId === person.id).map(({ employeeId: _, ...item }) => item),
      events: allEvents.filter((item) => item.employeeId === person.id).map(({ employeeId: _, ...item }) => item),
    })) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const record = employeeSchema.parse(await request.json());
    const db = getDb();
    await db.insert(employees).values({
      id: record.id, personnelNumber: record.personnelNumber, firstName: record.firstName, lastName: record.lastName, company: record.company,
      department: record.department, jobTitle: record.jobTitle, status: record.status, startDate: record.startDate, endDate: record.endDate,
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
    const payload = z.object({ employeeId: z.string(), taskId: z.string(), status: z.enum(["open", "ready", "done"]) }).parse(await request.json());
    const db = getDb();
    await db.update(workflowTasks).set({ status: payload.status, completedAt: payload.status === "done" ? new Date().toISOString() : null }).where(and(eq(workflowTasks.id, payload.taskId), eq(workflowTasks.employeeId, payload.employeeId)));
    await db.insert(auditEntries).values({ employeeId: payload.employeeId, action: "Aufgabe aktualisiert", detail: `${payload.taskId}: ${payload.status}` });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}
