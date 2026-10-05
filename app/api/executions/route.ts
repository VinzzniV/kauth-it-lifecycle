import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { auditEntries, automationActions, automationLocks, automationRuns, employees } from "../../../db/schema";
import { apiError, ContractError, credentialSchema, resultSchema } from "../../../lib/automation-contract";
import { importResult, queueJob, recordDispatchFailure } from "../../../lib/automation-store";
import { forwardToManagementAgent, ManagementHttpError, reconcileManagementJob } from "../../../lib/management-agent";

export async function POST() {
  return Response.json({ error: "Ergebnisse werden ausschließlich vom authentifizierten Gateway übernommen." }, { status: 403 });
}

export async function PUT(request: Request) {
  try {
    const input = z.object({ runId: z.string().min(1), action: z.string().min(1), resolution: z.enum(["verified_no_effect", "rollback_conflict_resolved", "gateway_reconcile"]), evidence: z.string().trim().min(20).max(2000) }).parse(await request.json());
    const db = getDb();
    const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, input.runId)).limit(1);
    if (input.resolution === "gateway_reconcile") {
      if (!run || !["queued", "review_required"].includes(run.status) || run.resultJson) throw new ContractError("Auftrag benötigt keinen Gateway-Abgleich.", 409);
      const proof = await (await reconcileManagementJob(run.jobId)).json() as { jobId?: string; noExecution?: boolean; result?: unknown };
      if (proof.jobId !== run.jobId) throw new ContractError("Gateway-Abgleich gehört zu einem anderen Auftrag.", 409);
      if (proof.result) return Response.json(await importResult(resultSchema.parse(proof.result)));
      if (proof.noExecution === true) {
        await recordDispatchFailure(JSON.parse(run.jobJson), new ManagementHttpError("Gateway-Abgleich: Auftrag wurde nie angenommen und gegen verspätete Annahme gesperrt.", 409, true));
        return Response.json({ ok: true, status: "failed" });
      }
      return Response.json({ ok: true, status: "running", message: "Gateway kennt den Auftrag; abschließendes Ergebnis abwarten." }, { status: 202 });
    }
    if (!run || run.mode !== "Execute" || !["review_required", "partial"].includes(run.status) || !run.resultJson) throw new ContractError("Vor manueller Klärung muss ein authentifiziertes abschließendes Gateway-Ergebnis vorliegen. Eine unbestätigte Übergabe kann noch laufen.", 409);
    const result = JSON.parse(run.resultJson);
    const review = JSON.parse(run.reviewJson ?? "{}");
    if (review[input.action]) throw new ContractError("Diese Klärung wurde bereits dokumentiert.", 409);
    if (input.resolution === "verified_no_effect") {
      const outcome = result.actionResults.find((a: { action: string; status: string }) => a.action === input.action && a.status === "review_required");
      if (run.operation !== "execute" || !outcome || result.changes.some((c: { action: string; status: string }) => c.action === input.action && c.status === "completed")) throw new ContractError("Dokumentierte Änderungen verhindern die Freigabe als wirkungslos. Manuelle Nacharbeit erforderlich.", 409);
    } else if (run.operation !== "rollback" || input.action !== "rollback" || !run.resultJson) throw new ContractError("Die Klärung benötigt ein abgeschlossenes Rücknahmeergebnis.", 409);
    review[input.action] = input.resolution;
    const reviewable = and(eq(automationRuns.id, run.id), eq(automationRuns.resultJson, run.resultJson), inArray(automationRuns.status, ["review_required", "partial"]), sql`EXISTS (SELECT 1 FROM automation_locks WHERE job_id = ${run.jobId})`);
    const stillReviewable = sql`EXISTS (SELECT 1 FROM automation_runs WHERE id = ${run.id} AND result_json = ${run.resultJson} AND status IN ('review_required','partial')) AND EXISTS (SELECT 1 FROM automation_locks WHERE job_id = ${run.jobId})`;
    const statements: [Parameters<typeof db.batch>[0][number], ...Parameters<typeof db.batch>[0][number][]] = [db.update(automationRuns).set({ reviewJson: sql`json_patch(COALESCE(review_json, '{}'), ${JSON.stringify({ [input.action]: input.resolution })})` }).where(reviewable)];
    if (input.resolution === "verified_no_effect") statements.push(db.update(automationActions).set({ status: "failed" }).where(and(eq(automationActions.jobId, run.jobId), eq(automationActions.action, input.action), inArray(automationActions.status, ["queued", "review_required"]), stillReviewable)));
    statements.push(db.update(automationRuns).set({ status: sql`CASE WHEN operation = 'execute' AND EXISTS (SELECT 1 FROM automation_actions WHERE job_id = ${run.jobId} AND status IN ('queued','review_required')) THEN 'review_required' ELSE 'reviewed' END` }).where(reviewable));
    statements.push(db.delete(automationLocks).where(and(eq(automationLocks.jobId, run.jobId), sql`EXISTS (SELECT 1 FROM automation_runs WHERE id = ${run.id} AND status = 'reviewed')`)));
    statements.push(db.insert(auditEntries).values({ employeeId: run.employeeId, action: "Automation manuell geprüft", detail: `${run.jobId} / ${input.action} / ${input.resolution}: ${input.evidence}` }));
    await db.batch(statements);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const input = z.object({ runId: z.string().min(1), mode: z.enum(["WhatIf", "Execute"]).default("WhatIf"), executeApproved: z.boolean().optional(), adCredential: credentialSchema }).parse(await request.json());
    if (input.mode === "Execute" && !input.executeApproved) throw new ContractError("Execute-Rücknahme benötigt eine ausdrückliche Freigabe.");
    const db = getDb();
    const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, input.runId)).limit(1);
    if (!run?.canRollback || run.operation !== "execute" || run.mode !== "Execute" || !run.resultJson) throw new ContractError("Für diese Ausführung ist keine geprüfte Rücknahme verfügbar.", 409);
    const [person] = await db.select().from(employees).where(eq(employees.id, run.employeeId)).limit(1);
    if (!person) throw new ContractError("Mitarbeiterakte wurde nicht gefunden.", 404);
    const previous = await db.select().from(automationRuns).where(and(eq(automationRuns.relatedRunId, run.id), eq(automationRuns.operation, "rollback"), eq(automationRuns.mode, "Execute")));
    const undone = new Set(previous.flatMap((r) => r.resultJson ? JSON.parse(r.resultJson).changes.filter((c: { status: string }) => c.status === "completed").map((c: { sourceChangeId: string }) => c.sourceChangeId) : []));
    const originalJob = JSON.parse(run.jobJson);
    const originalResult = JSON.parse(run.resultJson);
    const changes = originalResult.changes.filter((c: { id: string; status: string; rollbackAction: string }) => c.status === "completed" && c.rollbackAction !== "manual" && !undone.has(c.id));
    if (!changes.length) throw new ContractError("Keine noch ausstehende automatische Rücknahme vorhanden.", 409);
    const jobId = `rollback-${crypto.randomUUID()}`;
    const job = { schemaVersion: 1, operation: "rollback", jobId, runId: jobId,
      requestedMode: input.mode, executeApproved: input.executeApproved === true,
      lifecycleType: "change", person: originalJob.person, directory: originalJob.directory,
      adCredential: input.adCredential, automationTaskIds: [], originalRun: { id: run.id, mode: "Execute", changes },
    };
    await queueJob(job, run.id);
    try { await forwardToManagementAgent(job); }
    catch (error) { await recordDispatchFailure(job, error); }
    return Response.json({ ok: true, jobId });
  } catch (error) { return apiError(error); }
}
