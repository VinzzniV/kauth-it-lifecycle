import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { automationActions, automationRuns, employees, lifecycleEvents, masterData, services, workflowTasks } from "../../../db/schema";
import { applyMasterData, buildAutomationJob, ComputerAssignments, EmployeeRecord, MasterDataItem } from "../../data";
import { apiError, ContractError, credentialSchema } from "../../../lib/automation-contract";
import { actionKey, queueJob, recordDispatchFailure } from "../../../lib/automation-store";
import { forwardToManagementAgent } from "../../../lib/management-agent";

const requestSchema = z.object({
  schemaVersion: z.literal(1), operation: z.literal("execute"),
  jobId: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  requestedMode: z.enum(["WhatIf", "Execute"]), executeApproved: z.boolean().optional(),
  person: z.object({ employeeId: z.string().min(1) }),
  adCredential: credentialSchema.optional(), helpdeskCredential: credentialSchema.optional(),
  initialPassword: z.string().min(1).max(512).optional(),
  retryOfRunId: z.string().min(1).optional(), retryAction: z.string().min(1).optional(),
  directory: z.object({ computers: z.array(z.object({ type: z.enum(["Notebook", "Workstation"]), mode: z.enum(["new", "existing"]), existingName: z.string().max(15).regex(/^[A-Za-z0-9-]+$/).optional() })).max(2).optional() }).optional(),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    if (input.requestedMode === "Execute" && input.executeApproved !== true) throw new ContractError("Execute benötigt eine ausdrückliche Freigabe.");
    const db = getDb();
    const [person] = await db.select().from(employees).where(eq(employees.id, input.person.employeeId)).limit(1);
    if (!person) throw new ContractError("Mitarbeiterakte wurde nicht gefunden.", 404);
    const [items, tasks, events, storedRules] = await Promise.all([
      db.select().from(services).where(eq(services.employeeId, person.id)),
      db.select().from(workflowTasks).where(eq(workflowTasks.employeeId, person.id)),
      db.select().from(lifecycleEvents).where(eq(lifecycleEvents.employeeId, person.id)).orderBy(desc(lifecycleEvents.importedAt)),
      db.select().from(masterData),
    ]);
    const rules = storedRules as MasterDataItem[];
    const runtime = env as unknown as Record<string, string | undefined>;
    const assignments: ComputerAssignments = {};
    for (const computer of input.directory?.computers ?? []) assignments[computer.type] = { mode: computer.mode, existingName: computer.existingName };
    let job = { ...buildAutomationJob(applyMasterData({ ...person, services: items, tasks, events } as EmployeeRecord, rules), assignments, {
      masterData: rules, portalBaseUrl: runtime.IT_LIFECYCLE_WEB_URL,
      domain: runtime.AD_DOMAIN, mailDomain: runtime.AD_MAIL_DOMAIN,
      helpdeskBaseUrl: runtime.HELPDESK_BASE_URL, syncServer: runtime.M365_SYNC_SERVER,
      helpdeskResource: rules.find((r) => r.kind === "helpdesk" && r.active)?.value,
    }), jobId: input.jobId, lifecycleEventId: events[0]?.id ?? "", employeeRevision: person.updatedAt, requestedMode: input.requestedMode, executeApproved: input.executeApproved === true,
      adCredential: input.adCredential, helpdeskCredential: input.helpdeskCredential, initialPassword: input.initialPassword,
    };
    if (!events.length) throw new ContractError("Die Akte enthält keinen Lifecycle-Vorgang.");
    if (input.retryOfRunId) {
      if (!input.retryAction) throw new ContractError("Einzelaktion fehlt.");
      const [source] = await db.select().from(automationRuns).where(and(eq(automationRuns.id, input.retryOfRunId), eq(automationRuns.employeeId, person.id))).limit(1);
      if (!source || source.mode !== "Execute" || source.operation !== "execute") throw new ContractError("Kein geprüfter Ausgangslauf für die Wiederholung.", 409);
      const outcome = source.resultJson ? JSON.parse(source.resultJson).actionResults?.find((a: { action: string }) => a.action === input.retryAction) : undefined;
      const reviewedNoEffect = JSON.parse(source.reviewJson ?? "{}")[input.retryAction] === "verified_no_effect";
      const original = JSON.parse(source.jobJson);
      if (original.lifecycleEventId !== job.lifecycleEventId || (outcome?.status !== "failed" && !reviewedNoEffect)) throw new ContractError("Nur eindeutig fehlgeschlagene Aktionen desselben Vorgangs dürfen wiederholt werden.", 409);
      const action = original.actions.find((a: { type: string }) => a.type === input.retryAction);
      if (!action) throw new ContractError("Aktion fehlt im gespeicherten Auftrag.", 409);
      job = { ...original, jobId: input.jobId, employeeRevision: person.updatedAt, requestedMode: input.requestedMode, executeApproved: input.executeApproved === true,
        actions: [action], retryOfRunId: source.id, retryAction: input.retryAction,
        adCredential: input.adCredential, helpdeskCredential: input.helpdeskCredential, initialPassword: input.initialPassword };
      const [claim] = await db.select().from(automationActions).where(and(eq(automationActions.employeeId, person.id), eq(automationActions.eventId, job.lifecycleEventId), eq(automationActions.action, input.retryAction))).limit(1);
      if (!claim || claim.status !== "failed" || claim.jobId !== source.jobId) throw new ContractError("Die Aktion wurde inzwischen wiederholt oder muss geprüft werden.", 409);
    } else {
      const claims = await db.select().from(automationActions).where(and(eq(automationActions.employeeId, person.id), eq(automationActions.eventId, job.lifecycleEventId)));
      if (input.requestedMode === "Execute" && claims.some((c) => ["queued", "review_required"].includes(c.status))) throw new ContractError("Prüfung erforderlich: Eine frühere Aktion hat einen unklaren oder laufenden Zustand.", 409);
      if (input.requestedMode === "Execute" && claims.some((c) => c.status === "failed")) throw new ContractError("Bitte fehlgeschlagene Aktionen einzeln wiederholen.", 409);
      if (input.requestedMode === "Execute") job.actions = job.actions.filter((a) => !claims.some((c) => c.key === actionKey(person.id, job.lifecycleEventId, a.type) && c.status === "completed"));
    }
    if (!job.actions.length) throw new ContractError("Alle geplanten Aktionen wurden bereits ausgeführt.", 409);
    const requiresAd = job.actions.some((a) => a.type !== "CreateHelpdeskTicket");
    if (requiresAd && !input.adCredential) throw new ContractError("Für diese Aktion fehlt die AD-Anmeldung.");
    if (input.requestedMode === "Execute" && job.actions.some((a) => a.type === "CreateAdUser") && !input.initialPassword) throw new ContractError("Für die Benutzeranlage fehlt das initiale Kennwort.");
    if (input.requestedMode === "Execute" && job.actions.some((a) => a.type === "CreateHelpdeskTicket") && !input.helpdeskCredential) throw new ContractError("Für das Ticket fehlt die HelpDesk-Anmeldung.");
    await queueJob(job, input.retryOfRunId);
    try { await forwardToManagementAgent(job); }
    catch (error) {
      const status = await recordDispatchFailure(job, error);
      return Response.json({ ok: true, jobId: job.jobId, status }, { status: 202 });
    }
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    const jobId = z.string().min(1).max(150).regex(/^[a-zA-Z0-9._-]+$/).parse(new URL(request.url).searchParams.get("jobId"));
    const [run] = await getDb().select().from(automationRuns).where(eq(automationRuns.jobId, jobId)).limit(1);
    if (!run) throw new ContractError("Auftrag wurde nicht gefunden.", 404);
    if (run.resultJson) return Response.json(JSON.parse(run.resultJson));
    return Response.json({ status: run.status, error: run.error, currentAction: run.status === "review_required" ? "Prüfung erforderlich" : "Gateway-Ergebnis wird erwartet" }, { status: 202 });
  } catch (error) { return apiError(error); }
}
