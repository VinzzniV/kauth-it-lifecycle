import { z } from "zod";
import { forwardToManagementAgent, readManagementAgentResult } from "../../../lib/management-agent";

const jobSchema = z.object({
  schemaVersion: z.literal(1), operation: z.literal("execute"), jobId: z.string().min(1), requestedMode: z.enum(["WhatIf", "Execute"]), lifecycleType: z.enum(["onboarding", "change", "offboarding"]),
  person: z.object({ employeeId: z.string(), displayName: z.string(), personnelNumber: z.string() }).passthrough(),
  directory: z.object({ domain: z.literal("kauth.local"), samAccountName: z.string(), targetOu: z.string() }).passthrough(),
  helpdesk: z.object({ baseUrl: z.string(), subject: z.string(), text: z.string() }),
  actions: z.array(z.object({ type: z.string(), target: z.string(), requiresApproval: z.literal(true) })),
}).passthrough();

export async function POST(request: Request) {
  try {
    const job = jobSchema.parse(await request.json());
    await forwardToManagementAgent(job);
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) { const message = error instanceof Error ? error.message : "Der Auftrag ist ungültig."; return Response.json({ error: message }, { status: message.includes("Management-Agent") ? 503 : 400 }); }
}

export async function GET(request: Request) {
  try {
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (!jobId || !/^[a-zA-Z0-9._-]+$/.test(jobId)) return Response.json({ error: "Ungültige Auftragsnummer." }, { status: 400 });
    const response = await readManagementAgentResult(jobId);
    if (response.status === 202 || response.status === 404) return Response.json({ status: "running" }, { status: 202 });
    if (!response.ok) return Response.json({ error: `Ergebnis konnte nicht gelesen werden (${response.status}).` }, { status: 502 });
    return Response.json(await response.json());
  } catch (error) { const message = error instanceof Error ? error.message : "Ergebnis konnte nicht gelesen werden."; return Response.json({ error: message }, { status: message.includes("Management-Agent") ? 503 : 400 }); }
}
