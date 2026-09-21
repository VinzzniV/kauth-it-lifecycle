import { z } from "zod";
import {
  forwardToManagementAgent,
  readManagementAgentResult,
} from "../../../lib/management-agent";
import { getDb } from "../../../db";
import { automationRuns } from "../../../db/schema";
import { eq } from "drizzle-orm";

const adCredentialSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(
      /^[\p{L}\p{N}._@\\-]+$/u,
      "Der AD-Benutzername enthält ungültige Zeichen.",
    ),
  password: z.string().min(1).max(512),
});

const jobSchema = z.discriminatedUnion("operation", [
  z
    .object({
      schemaVersion: z.literal(1),
      operation: z.literal("execute"),
      jobId: z.string().min(1),
      requestedMode: z.enum(["WhatIf", "Execute"]),
      lifecycleType: z.enum(["onboarding", "change", "offboarding"]),
      person: z
        .object({
          employeeId: z.string(),
          displayName: z.string(),
          personnelNumber: z.string(),
        })
        .passthrough(),
      directory: z
        .object({
          domain: z.literal("kauth.local"),
          samAccountName: z.string(),
          targetOu: z.string(),
        })
        .passthrough(),
      adCredential: adCredentialSchema.optional(),
      helpdeskCredential: adCredentialSchema.optional(),
      initialPassword: z.string().min(1).max(512).optional(),
      retryOfRunId: z.string().min(1).optional(),
      retryAction: z.string().min(1).optional(),
      helpdesk: z.object({
        baseUrl: z.string(),
        subject: z.string(),
        text: z.string(),
        resource: z.string().max(500).optional(),
      }),
      microsoft365: z.object({
        syncServer: z.literal("PK-SRVMGMT001"),
        skuPartNumber: z.literal("SPB"),
        usageLocation: z.string().regex(/^[A-Z]{2}$/),
        userSyncTimeoutMinutes: z.number().int().min(1).max(60),
        mailboxTimeoutMinutes: z.number().int().min(1).max(60),
      }),
      actions: z.array(
        z.object({
          type: z.string(),
          target: z.string(),
          requiresApproval: z.literal(true),
        }),
      ),
    })
    .passthrough(),
  z
    .object({
      schemaVersion: z.literal(1),
      operation: z.literal("reference_check"),
      jobId: z.string().min(1),
      requestedMode: z.literal("WhatIf"),
      person: z
        .object({
          employeeId: z.string(),
          displayName: z.string(),
          personnelNumber: z.string(),
        })
        .passthrough(),
      directory: z
        .object({
          domain: z.literal("kauth.local"),
          referenceUser: z.object({
            query: z.string(),
            displayName: z.string(),
          }),
        })
        .passthrough(),
      adCredential: adCredentialSchema,
    })
    .passthrough(),
]);

export async function POST(request: Request) {
  try {
    const job = jobSchema.parse(await request.json());
    if (
      job.operation === "execute" &&
      job.retryOfRunId &&
      (job.actions.length !== 1 || job.actions[0]?.type !== job.retryAction)
    )
      return Response.json(
        { error: "Die gezielte Wiederholung enthält nicht genau eine Aktion." },
        { status: 400 },
      );
    if (
      job.operation === "execute" &&
      job.actions.some((action) => action.type !== "CreateHelpdeskTicket") &&
      !job.adCredential
    )
      return Response.json(
        { error: "Für diese Aktion fehlt die AD-Anmeldung." },
        { status: 400 },
      );
    if (
      job.operation === "execute" &&
      job.requestedMode === "Execute" &&
      job.actions.some((action) => action.type === "CreateAdUser") &&
      !job.initialPassword
    )
      return Response.json(
        {
          error:
            "Für die aktivierte Benutzeranlage fehlt das initiale Benutzerkennwort.",
        },
        { status: 400 },
      );
    if (
      job.operation === "execute" &&
      job.requestedMode === "Execute" &&
      job.actions.some((action) => action.type === "CreateHelpdeskTicket") &&
      !job.helpdeskCredential
    )
      return Response.json(
        {
          error:
            "Für das HelpDesk-Ticket fehlt die separate Windows-Anmeldung eines HelpDesk-berechtigten Kontos.",
        },
        { status: 400 },
      );
    const db = getDb();
    const [existingRun] = await db
      .select({ id: automationRuns.id })
      .from(automationRuns)
      .where(eq(automationRuns.id, job.jobId))
      .limit(1);
    if (existingRun)
      return Response.json(
        {
          error: `Auftrag ${job.jobId} wurde bereits angelegt und wird nicht erneut gestartet.`,
        },
        { status: 409 },
      );
    const now = new Date().toISOString();
    await db
      .insert(automationRuns)
      .values({
        id: job.jobId,
        employeeId: job.person.employeeId,
        jobId: job.jobId,
        operation: "execute",
        mode: job.requestedMode,
        status: "queued",
        relatedRunId:
          job.operation === "execute" ? (job.retryOfRunId ?? null) : null,
        canRollback: false,
        startedAt: now,
        error: "",
      })
      .onConflictDoNothing();
    try {
      await forwardToManagementAgent(job);
    } catch (error) {
      await db
        .update(automationRuns)
        .set({
          status: "failed",
          completedAt: new Date().toISOString(),
          error:
            error instanceof Error
              ? error.message
              : "Management-Agent nicht erreichbar",
        })
        .where(eq(automationRuns.id, job.jobId));
      throw error;
    }
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Der Auftrag ist ungültig.";
    return Response.json(
      { error: message },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (!jobId || !/^[a-zA-Z0-9._-]+$/.test(jobId))
      return Response.json(
        { error: "Ungültige Auftragsnummer." },
        { status: 400 },
      );
    const response = await readManagementAgentResult(jobId);
    if (response.status === 202) {
      const progress = await response.json().catch(() => ({
        status: "running",
      }));
      return Response.json(progress, { status: 202 });
    }
    if (!response.ok)
      return Response.json(
        { error: `Ergebnis konnte nicht gelesen werden (${response.status}).` },
        { status: 502 },
      );
    return Response.json(await response.json());
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Ergebnis konnte nicht gelesen werden.";
    return Response.json({ error: message }, { status: 503 });
  }
}
