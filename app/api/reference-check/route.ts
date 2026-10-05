import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { employees } from "../../../db/schema";
import { forwardToManagementAgent } from "../../../lib/management-agent";
import { queueJob, recordDispatchFailure } from "../../../lib/automation-store";
import { apiError } from "../../../lib/automation-contract";

export async function POST(request: Request) {
  try {
    const payload = z
      .object({
        employeeId: z.string().min(1),
        referenceUser: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .regex(
            /^[\p{L}\p{N} ._'@-]+$/u,
            "Der Referenzbenutzer enthält ungültige Zeichen.",
          ),
        adCredential: z.object({
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
        }),
      })
      .parse(await request.json());
    const db = getDb();
    const [person] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, payload.employeeId))
      .limit(1);
    if (!person)
      return Response.json(
        { error: "Mitarbeiterakte wurde nicht gefunden." },
        { status: 404 },
      );

    const jobId = `reference-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const job = {
      schemaVersion: 1,
      operation: "reference_check",
      jobId,
      requestedMode: "WhatIf",
      person: {
        employeeId: person.id,
        personnelNumber: person.personnelNumber,
        displayName: `${person.firstName} ${person.lastName}`,
      },
      directory: {
        domain: (env as unknown as Record<string, string | undefined>).AD_DOMAIN || "kauth.local",
        referenceUser: {
          query: payload.referenceUser,
          displayName: payload.referenceUser,
        },
      },
      adCredential: payload.adCredential,
      automationTaskIds: [],
    };

    await queueJob(job);
    await db
      .update(employees)
      .set({
        directoryReferenceUser: payload.referenceUser,
        directoryReferenceStatus: "checking",
        directoryReferenceMessage: "Prüfung läuft",
        directoryTargetOu: "",
        updatedAt: now,
      })
      .where(eq(employees.id, person.id));
    try {
      await forwardToManagementAgent(job);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Management-Agent nicht erreichbar";
      const status = await recordDispatchFailure(job, error);
      await db
        .update(employees)
        .set({
          directoryReferenceStatus: "error",
          directoryReferenceMessage: message,
        })
        .where(and(eq(employees.id, person.id), sql`NOT EXISTS (SELECT 1 FROM automation_receipts WHERE job_id = ${jobId})`));
      return Response.json({ ok: true, jobId, status }, { status: 202 });
    }
    return Response.json({ ok: true, jobId });
  } catch (error) {
    return apiError(error);
  }
}
