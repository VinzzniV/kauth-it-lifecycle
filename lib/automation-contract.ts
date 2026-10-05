import { z } from "zod";

export class ContractError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const credentialSchema = z.object({
  username: z.string().trim().min(1).max(200).regex(/^[\p{L}\p{N}._@\\-]+$/u),
  password: z.string().min(1).max(512),
});
export const actionResultSchema = z.object({
  action: z.string().min(1).max(500),
  status: z.enum(["completed", "failed", "review_required", "simulated"]),
  error: z.string().max(4000).optional(),
  automationTaskIds: z.array(z.string()).optional(),
});
export const resultSchema = z.object({
  schemaVersion: z.literal(1), runId: z.string(), jobId: z.string(), employeeId: z.string(),
  operation: z.enum(["execute", "rollback", "reference_check"]),
  mode: z.enum(["WhatIf", "Execute"]),
  status: z.enum(["completed", "partial", "failed", "review_required"]),
  relatedRunId: z.string().nullable().optional(),
  startedAt: z.string().datetime({ offset: true }), completedAt: z.string().datetime({ offset: true }),
  error: z.string().max(4000).optional(),
  automationTaskIds: z.preprocess((v) => v == null ? [] : Array.isArray(v) ? v : [v], z.array(z.string())).default([]),
  actionResults: z.array(actionResultSchema).default([]),
  changes: z.array(z.object({
    id: z.string().optional(), action: z.string(), resourceType: z.string(), resourceId: z.string(),
    relation: z.string().default(""), memberId: z.string().nullable().optional(),
    sourceChangeId: z.string().nullable().optional(), sourceAction: z.string().nullable().optional(),
    beforeValue: z.unknown().optional(), afterValue: z.unknown().optional(),
    rollbackAction: z.string().default("manual"), status: z.string().default("completed"),
  })).max(1000).default([]),
  referenceLookup: z.object({
    query: z.string(), status: z.enum(["found", "not_found", "ambiguous"]), count: z.number(),
    samAccountName: z.string().optional(), displayName: z.string().optional(),
    distinguishedName: z.string().optional(), targetOu: z.string().optional(),
  }).nullable().optional(),
  directoryIdentity: z.object({ objectGuid: z.string().uuid(), samAccountName: z.string(), userPrincipalName: z.string(), personnelNumber: z.string() }).nullable().optional(),
});
export type AgentResult = z.infer<typeof resultSchema>;
export const rollbackActions = new Set(["Remove-ADUser", "Remove-ADComputer", "Restore-ADComputerDescription", "Enable-ADAccount", "Move-ADObject", "Remove-ADGroupMember", "Add-ADGroupMember", "Restore-ADUserAttributes"]);
export type StoredJob = {
  jobId: string; operation: string; requestedMode: string;
  person: { employeeId: string }; originalRun?: { id: string; changes?: { id: string; action: string; resourceId: string; rollbackAction: string }[] };
  lifecycleType?: string; lifecycleEventId?: string;
  retryOfRunId?: string;
  automationTaskIds?: string[];
  actions?: { type: string; target: string }[];
  actionTaskIds?: Record<string, string[]>; actionServiceIds?: Record<string, string[]>;
};

export function validateResultBinding(result: AgentResult, job: StoredJob) {
  if (result.runId !== job.jobId || result.jobId !== job.jobId || result.employeeId !== job.person.employeeId || result.operation !== job.operation || result.mode !== job.requestedMode)
    throw new ContractError("Ergebnis gehört nicht zum gespeicherten Auftrag.", 409);
  if (result.operation === "rollback" && result.relatedRunId !== job.originalRun?.id)
    throw new ContractError("Ausgangslauf der Rücknahme stimmt nicht überein.", 409);
  if (result.operation === "execute" && (result.relatedRunId ?? null) !== (job.retryOfRunId ?? null)) throw new ContractError("Wiederholung gehört nicht zum Ausgangslauf.", 409);
  const allowed = new Set(job.actions?.map((a) => a.type) ?? []);
  const seen = new Set<string>();
  for (const outcome of result.actionResults) {
    if ((result.operation === "execute" && seen.has(outcome.action)) || (result.operation === "execute" && !allowed.has(outcome.action)))
      throw new ContractError("Unbekannte oder doppelte Einzelaktion im Ergebnis.", 409);
    seen.add(outcome.action);
    if (result.mode === "WhatIf" && outcome.status === "completed")
      throw new ContractError("WhatIf darf keine ausgeführte Änderung melden.", 409);
    if (result.mode === "Execute" && outcome.status === "simulated") throw new ContractError("Execute-Ergebnis enthält eine Simulation.", 409);
    if (result.status === "completed" && !["completed", "simulated"].includes(outcome.status)) throw new ContractError("Fehlgeschlagene Aktion in abgeschlossenem Ergebnis.", 409);
  }
  if (result.operation === "execute" && result.status === "completed" && [...allowed].some((a) => !seen.has(a)))
    throw new ContractError("Abgeschlossenes Ergebnis enthält nicht alle Einzelaktionen.", 409);
  for (const task of result.automationTaskIds) {
    if (!job.automationTaskIds?.includes(task)) throw new ContractError("Aufgabe gehört nicht zum Auftrag.", 409);
  }
  for (const change of result.changes) {
    if (result.operation === "execute" && !allowed.has(change.action)) throw new ContractError("Änderung gehört nicht zu einer geplanten Aktion.", 409);
    if (result.mode === "WhatIf" && change.status === "completed") throw new ContractError("WhatIf meldet eine reale Änderung.", 409);
    if (result.operation === "execute" && result.mode === "Execute" && change.status === "completed" && change.rollbackAction !== "manual" && (!rollbackActions.has(change.rollbackAction) || !z.string().uuid().safeParse(change.resourceId).success)) throw new ContractError("Rücknahmeweg oder unveränderliche Objektidentität nicht unterstützt.", 409);
    if (result.operation === "rollback") {
      const source = job.originalRun?.changes?.find((c) => c.id === change.sourceChangeId);
      if (!source || source.resourceId !== change.resourceId || source.action !== change.sourceAction) throw new ContractError("Rücknahmeänderung gehört nicht zum gespeicherten Auftrag.", 409);
    }
  }
  if (result.operation === "rollback" && new Set(result.changes.map((c) => c.sourceChangeId)).size !== result.changes.length) throw new ContractError("Doppelte Rücknahmeänderung.", 409);
}

export function sanitizedJob<T extends Record<string, unknown>>(job: T) {
  const clean = { ...job };
  for (const key of ["adCredential", "helpdeskCredential", "initialPassword", "callbackUrl", "callbackToken"]) delete clean[key];
  return clean;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function apiError(error: unknown) {
  const status = error instanceof ContractError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
  const message = error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : error instanceof Error ? error.message : "Verarbeitung fehlgeschlagen.";
  return Response.json({ error: message }, { status });
}
