import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { auditEntries, automationActions, automationChanges, automationLocks, automationReceipts, automationRuns, employees, lifecycleEvents, services, workflowTasks } from "../db/schema";
import { AgentResult, canonicalJson, ContractError, rollbackActions, sanitizedJob, StoredJob, validateResultBinding } from "./automation-contract";
import { ManagementHttpError } from "./management-agent";

export function actionKey(employeeId: string, eventId: string, action: string) {
  return JSON.stringify([employeeId, eventId, action.replace(/^(Create|Reuse)AdComputer:/, "AdComputer:")]);
}

export async function recordDispatchFailure(job: StoredJob, error: unknown) {
  const db = getDb();
  const [existing] = await db.select().from(automationRuns).where(eq(automationRuns.jobId, job.jobId)).limit(1);
  if (existing?.resultJson) return existing.status;
  if (error instanceof ManagementHttpError && error.noExecution) {
    const now = new Date().toISOString();
    await importResult({ schemaVersion: 1, runId: job.jobId, jobId: job.jobId, employeeId: job.person.employeeId,
      operation: job.operation as AgentResult["operation"], mode: job.requestedMode as AgentResult["mode"], status: "failed",
      startedAt: now, completedAt: now, error: error.message, relatedRunId: job.originalRun?.id ?? job.retryOfRunId ?? null,
      changes: [], automationTaskIds: [], actionResults: (job.actions ?? []).map((a) => ({ action: a.type, status: "failed", error: "Gateway hat vor Annahme abgelehnt; keine Ausführung." })),
    });
    return "failed";
  }
  await db.update(automationRuns).set({ status: "review_required", error: "Übergabe nicht bestätigt. Gateway-Abgleich abwarten; nicht erneut starten." }).where(and(eq(automationRuns.jobId, job.jobId), isNull(automationRuns.resultJson)));
  const [current] = await db.select({ status: automationRuns.status }).from(automationRuns).where(eq(automationRuns.jobId, job.jobId)).limit(1);
  return current?.status ?? "review_required";
}

export async function queueJob(job: Record<string, unknown> & StoredJob, relatedRunId?: string) {
  const db = getDb();
  const [person] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, job.person.employeeId)).limit(1);
  if (!person) throw new ContractError("Mitarbeiterakte wurde nicht gefunden.", 404);
  try {
    const writes = [
      db.insert(automationLocks).values({ employeeId: person.id, jobId: job.jobId }),
      db.insert(automationRuns).values({
        id: job.jobId, jobId: job.jobId, employeeId: person.id, operation: job.operation,
        mode: job.requestedMode, status: "queued", relatedRunId: relatedRunId ?? null,
        startedAt: new Date().toISOString(), jobJson: JSON.stringify(sanitizedJob(job)),
      }),
    ] as const;
    // The employee lock serializes checks and claims across every action in a job.
    // Existing failed claims are checked by the caller before this atomic batch.
    const claims = job.requestedMode === "Execute" && job.operation === "execute" ? (job.actions ?? []) : [];
    await db.batch([
      ...writes,
      ...claims.map((a) => db.insert(automationActions).values({
        key: actionKey(person.id, job.lifecycleEventId ?? "", a.type), employeeId: person.id,
        eventId: job.lifecycleEventId ?? "", action: a.type, jobId: job.jobId, status: "queued",
      }).onConflictDoUpdate({ target: automationActions.key, set: { jobId: job.jobId, status: "queued" }, where: inArray(automationActions.status, ["failed", "rolled_back"]) })),
    ]);
  } catch {
    throw new ContractError("Für diese Akte läuft bereits ein Auftrag oder die Auftrags-ID wurde schon verwendet.", 409);
  }
}

export async function importResult(result: AgentResult) {
  const db = getDb();
  const [run] = await db.select().from(automationRuns).where(eq(automationRuns.jobId, result.jobId)).limit(1);
  if (!run) throw new ContractError("Kein gespeicherter Auftrag für dieses Ergebnis.", 409);
  const job = JSON.parse(run.jobJson) as StoredJob;
  validateResultBinding(result, job);
  const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(result)));
  const digest = Array.from(new Uint8Array(digestBytes), (n) => n.toString(16).padStart(2, "0")).join("");
  const receipt = await db.select().from(automationReceipts).where(eq(automationReceipts.jobId, result.jobId)).limit(1);
  if (receipt.length) {
    if (receipt[0].digest !== digest) throw new ContractError("Abweichendes Ergebnis für bereits importierten Auftrag.", 409);
    return { ok: true, duplicate: true };
  }
  const reversible = result.changes.some((c) => c.status === "completed" && rollbackActions.has(c.rollbackAction) && /^[0-9a-f-]{36}$/i.test(c.resourceId));
  const writes = [
    db.insert(automationReceipts).values({ jobId: result.jobId, digest, importedAt: new Date().toISOString() }),
    db.update(automationRuns).set({ status: result.status, completedAt: result.completedAt,
      error: result.error ?? "", resultJson: JSON.stringify(result),
      canRollback: result.operation === "execute" && result.mode === "Execute" && reversible,
    }).where(eq(automationRuns.id, run.id)),
  ] as const;
  // batch() is one SQLite transaction. A competing receipt insert aborts every write.
  const extra: Parameters<typeof db.batch>[0][number][] = [];
  for (let i = 0; i < result.changes.length; i++) {
    const c = result.changes[i];
    extra.push(db.insert(automationChanges).values({
      id: `${run.id}-change-${i}`, runId: run.id, action: c.action, resourceType: c.resourceType,
      resourceId: c.resourceId, relation: c.relation, memberId: c.memberId,
      beforeValue: c.beforeValue === undefined ? null : JSON.stringify(c.beforeValue),
      afterValue: c.afterValue === undefined ? null : JSON.stringify(c.afterValue),
      rollbackAction: c.rollbackAction, status: c.status,
    }));
  }
  if (result.operation === "reference_check") {
    const lookup = result.referenceLookup;
    const message = lookup?.status === "found" ? `${lookup.displayName ?? lookup.samAccountName} gefunden` : lookup?.status === "ambiguous" ? `${lookup.count} passende Benutzer gefunden` : result.error || "Referenzbenutzer nicht gefunden";
    extra.push(db.update(employees).set({ directoryReferenceUser: lookup?.samAccountName ?? lookup?.query,
      directoryReferenceStatus: lookup?.status ?? "error", directoryReferenceMessage: message,
      directoryTargetOu: lookup?.status === "found" ? lookup.targetOu ?? "" : "", updatedAt: result.completedAt,
    }).where(eq(employees.id, run.employeeId)));
  }
  if (result.operation === "execute" && result.mode === "Execute") {
    for (const action of job.actions ?? []) {
      const outcome = result.actionResults.find((a) => a.action === action.type);
      const status = outcome?.status ?? (result.status === "review_required" ? "review_required" : "failed");
      extra.push(db.update(automationActions).set({ status }).where(and(eq(automationActions.jobId, run.jobId), eq(automationActions.action, action.type))));
      if (status !== "completed") continue;
      for (const taskId of job.actionTaskIds?.[action.type] ?? []) extra.push(db.update(workflowTasks).set({ status: "done", completedAt: result.completedAt }).where(and(eq(workflowTasks.employeeId, run.employeeId), eq(workflowTasks.id, taskId))));
      for (const serviceId of job.actionServiceIds?.[action.type] ?? []) extra.push(db.update(services).set({ status: job.lifecycleType === "offboarding" ? "removed" : "active" }).where(and(eq(services.employeeId, run.employeeId), eq(services.id, serviceId))));
    }
    const assignedUser = result.changes.find((c) => c.resourceType === "AD-Benutzer" && c.status === "completed" && /^[0-9a-f-]{36}$/i.test(c.resourceId));
    if (result.directoryIdentity) {
      const [owner] = await db.select({ personnelNumber: employees.personnelNumber }).from(employees).where(eq(employees.id, run.employeeId)).limit(1);
      if (owner?.personnelNumber !== result.directoryIdentity.personnelNumber) throw new ContractError("AD-Zuordnung gehört zu einer anderen Personalnummer.", 409);
      extra.push(db.update(employees).set({ directoryObjectGuid: result.directoryIdentity.objectGuid, directorySamAccountName: result.directoryIdentity.samAccountName, directoryUpn: result.directoryIdentity.userPrincipalName }).where(eq(employees.id, run.employeeId)));
    } else if (assignedUser) {
      const plannedDirectory = (job as StoredJob & { directory?: { samAccountName?: string; userPrincipalName?: string } }).directory;
      extra.push(db.update(employees).set({ directoryObjectGuid: assignedUser.resourceId, directorySamAccountName: plannedDirectory?.samAccountName ?? "", directoryUpn: plannedDirectory?.userPrincipalName ?? "" }).where(eq(employees.id, run.employeeId)));
    }
  }
  if (result.operation === "rollback" && result.mode === "Execute" && result.relatedRunId) {
    const [original] = await db.select().from(automationRuns).where(and(eq(automationRuns.id, result.relatedRunId), eq(automationRuns.employeeId, run.employeeId))).limit(1);
    if (!original?.resultJson) throw new ContractError("Ausgangsergebnis der Rücknahme fehlt.", 409);
    const source = JSON.parse(original.resultJson) as AgentResult;
    const originalJob = JSON.parse(original.jobJson) as StoredJob;
    const previous = await db.select().from(automationRuns).where(and(eq(automationRuns.relatedRunId, original.id), eq(automationRuns.operation, "rollback"), eq(automationRuns.mode, "Execute")));
    const previousIds = previous.flatMap((r) => r.resultJson ? (JSON.parse(r.resultJson) as AgentResult).changes.filter((c) => c.status === "completed").map((c) => c.sourceChangeId) : []);
    const undoneIds = new Set([...previousIds, ...result.changes.filter((c) => c.status === "completed").map((c) => c.sourceChangeId)]);
    const changes = source.changes.filter((c) => c.status === "completed" && c.rollbackAction !== "manual");
    for (const id of undoneIds) if (!changes.some((c) => c.id === id)) throw new ContractError("Rücknahme enthält eine fremde Änderung.", 409);
    const fullyUndone = changes.length > 0 && changes.every((c) => undoneIds.has(c.id));
    extra.push(db.update(automationRuns).set({ canRollback: !fullyUndone, status: fullyUndone ? "rolled_back" : original.status }).where(eq(automationRuns.id, original.id)));
    for (const change of result.changes.filter((c) => c.status === "completed")) {
      const sourceChange = source.changes.find((c) => c.id === change.sourceChangeId);
      if (sourceChange?.rollbackAction === "Remove-ADUser") extra.push(db.update(employees).set({ directoryObjectGuid: "", directorySamAccountName: "", directoryUpn: "" }).where(and(eq(employees.id, run.employeeId), eq(employees.directoryObjectGuid, sourceChange.resourceId))));
    }
    for (const action of originalJob.actions ?? []) {
      const related = source.changes.filter((c) => c.action === action.type && c.status === "completed");
      if (!related.length || !related.every((c) => c.rollbackAction !== "manual" && undoneIds.has(c.id))) continue;
      extra.push(db.update(automationActions).set({ status: "rolled_back" }).where(and(eq(automationActions.jobId, original.jobId), eq(automationActions.action, action.type))));
      for (const taskId of originalJob.actionTaskIds?.[action.type] ?? []) extra.push(db.update(workflowTasks).set({ status: "ready", completedAt: null }).where(and(eq(workflowTasks.employeeId, run.employeeId), eq(workflowTasks.id, taskId))));
      for (const serviceId of originalJob.actionServiceIds?.[action.type] ?? []) extra.push(db.update(services).set({ status: originalJob.lifecycleType === "offboarding" ? "active" : "requested" }).where(and(eq(services.employeeId, run.employeeId), eq(services.id, serviceId))));
    }
  }
  if (result.mode === "Execute") {
    extra.push(db.update(lifecycleEvents).set({ status: sql`CASE WHEN EXISTS (SELECT 1 FROM workflow_tasks WHERE lifecycle_event_id = lifecycle_events.id AND status <> 'done') THEN 'in_review' ELSE 'completed' END` }).where(eq(lifecycleEvents.employeeId, run.employeeId)));
    extra.push(db.update(employees).set({ status: sql`CASE WHEN EXISTS (SELECT 1 FROM workflow_tasks WHERE employee_id = ${run.employeeId} AND lifecycle_event_id = (SELECT id FROM lifecycle_events WHERE employee_id = ${run.employeeId} ORDER BY imported_at DESC LIMIT 1) AND status <> 'done') THEN CASE WHEN (SELECT type FROM lifecycle_events WHERE employee_id = ${run.employeeId} ORDER BY imported_at DESC LIMIT 1) = 'offboarding' THEN 'leaving' ELSE 'pending' END ELSE 'completed' END`, updatedAt: result.completedAt }).where(eq(employees.id, run.employeeId)));
  }
  if (!result.actionResults.some((a) => a.status === "review_required") && result.status !== "review_required") extra.push(db.delete(automationLocks).where(eq(automationLocks.jobId, run.jobId)));
  extra.push(db.insert(auditEntries).values({ employeeId: run.employeeId,
    action: result.operation === "reference_check" ? "Referenzbenutzer geprüft" : result.mode === "WhatIf" ? "Automation simuliert" : result.operation === "rollback" ? "Rücknahme geprüft" : "Automationsergebnis übernommen",
    detail: `${run.jobId}: ${result.status}`,
  }));
  try { await db.batch([...writes, ...extra]); }
  catch (error) {
    const [concurrent] = await db.select().from(automationReceipts).where(eq(automationReceipts.jobId, result.jobId)).limit(1);
    if (concurrent?.digest === digest) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false };
}
