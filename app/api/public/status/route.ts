import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db";
import {
  automationRuns,
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
  if (!employee || !employee.shareExpiresAt || Date.parse(employee.shareExpiresAt) <= Date.now())
    return Response.json({ error: "Vorgang wurde nicht gefunden." }, { status: 404 });

  const db = getDb();
  const [tasks, assignedServices, events, runs] = await Promise.all([
    db.select().from(workflowTasks).where(eq(workflowTasks.employeeId, employee.id)),
    db.select().from(services).where(eq(services.employeeId, employee.id)),
    db.select().from(lifecycleEvents).where(eq(lifecycleEvents.employeeId, employee.id)).orderBy(desc(lifecycleEvents.importedAt)),
    db.select().from(automationRuns).where(eq(automationRuns.employeeId, employee.id)).orderBy(desc(automationRuns.startedAt)),
  ]);

  return Response.json({
    employee: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department,
      status: employee.status,
      startDate: employee.startDate,
      endDate: employee.endDate,
      tasks: tasks.filter((task) => !task.lifecycleEventId || task.lifecycleEventId === events[0]?.id).map((task) => ({ id: task.id, eventType: task.eventType, title: task.title, owner: task.owner, executionType: task.executionType, status: task.status, dueDate: task.dueDate, completedAt: task.completedAt })),
      services: assignedServices.map((service) => ({ id: service.id, label: service.label, category: service.category, status: service.status })),
      events: events.map((event) => ({ type: event.type, status: event.status })),
      automationRuns: runs.map((run) => ({
        status: run.status, startedAt: run.startedAt, completedAt: run.completedAt,
      })),
    },
  }, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export async function PATCH() { return Response.json({ error: "Statuslinks sind reine Leseansichten. Bitte intern anmelden." }, { status: 405, headers: { Allow: "GET" } }); }
