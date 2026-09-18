import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { automationRuns, employees } from "../../../db/schema";
import { forwardToManagementAgent } from "../../../lib/management-agent";

export async function POST(request: Request) {
  try {
    const payload = z.object({
      employeeId: z.string().min(1),
      referenceUser: z.string().trim().min(1).max(200).regex(/^[\p{L}\p{N} ._'@-]+$/u, "Der Referenzbenutzer enthält ungültige Zeichen."),
    }).parse(await request.json());
    const db = getDb();
    const [person] = await db.select().from(employees).where(eq(employees.id, payload.employeeId)).limit(1);
    if (!person) return Response.json({ error: "Mitarbeiterakte wurde nicht gefunden." }, { status: 404 });

    const jobId = `reference-${person.personnelNumber}-${Date.now()}`;
    const now = new Date().toISOString();
    const job = {
      schemaVersion: 1,
      operation: "reference_check",
      jobId,
      requestedMode: "WhatIf",
      person: { employeeId: person.id, personnelNumber: person.personnelNumber, displayName: `${person.firstName} ${person.lastName}` },
      directory: { domain: "kauth.local", referenceUser: { query: payload.referenceUser, displayName: payload.referenceUser } },
      automationTaskIds: [],
    };

    await db.update(employees).set({ directoryReferenceUser: payload.referenceUser, directoryReferenceStatus: "checking", directoryReferenceMessage: "Prüfung läuft", directoryTargetOu: "", updatedAt: now }).where(eq(employees.id, person.id));
    await db.insert(automationRuns).values({ id: jobId, employeeId: person.id, jobId, operation: "reference_check", mode: "WhatIf", status: "queued", canRollback: false, startedAt: now, error: "" }).onConflictDoNothing();
    try {
      await forwardToManagementAgent(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Management-Agent nicht erreichbar";
      await db.update(automationRuns).set({ status: "failed", completedAt: new Date().toISOString(), error: message }).where(eq(automationRuns.id, jobId));
      await db.update(employees).set({ directoryReferenceStatus: "error", directoryReferenceMessage: message }).where(eq(employees.id, person.id));
      throw error;
    }
    return Response.json({ ok: true, jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Referenzbenutzer konnte nicht geprüft werden.";
    return Response.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 503 });
  }
}
