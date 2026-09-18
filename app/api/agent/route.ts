import { env } from "cloudflare:workers";
import { z } from "zod";

const jobSchema = z.object({
  schemaVersion: z.literal(1), jobId: z.string().min(1), requestedMode: z.literal("WhatIf"), lifecycleType: z.enum(["onboarding", "change", "offboarding"]),
  person: z.object({ displayName: z.string(), personnelNumber: z.string() }).passthrough(),
  directory: z.object({ domain: z.literal("kauth.local"), samAccountName: z.string(), targetOu: z.string() }).passthrough(),
  helpdesk: z.object({ baseUrl: z.string(), subject: z.string(), text: z.string() }),
  actions: z.array(z.object({ type: z.string(), target: z.string(), requiresApproval: z.literal(true) })),
}).passthrough();

export async function POST(request: Request) {
  try {
    const job = jobSchema.parse(await request.json());
    const runtime = env as unknown as Record<string, string | undefined>;
    const gatewayUrl = runtime.MANAGEMENT_AGENT_URL;
    const tunnel = (env as unknown as { CUSTOMER_HTTP_MANAGEMENT_AGENT?: { fetch: (request: Request) => Promise<Response> } }).CUSTOMER_HTTP_MANAGEMENT_AGENT;
    if (!gatewayUrl && !tunnel) return Response.json({ error: "Der Management-Agent ist noch nicht mit der Website verbunden. Auftrag und Agent können weiterhin heruntergeladen und lokal im WhatIf-Modus ausgeführt werden." }, { status: 503 });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (runtime.MANAGEMENT_AGENT_TOKEN) headers.authorization = `Bearer ${runtime.MANAGEMENT_AGENT_TOKEN}`;
    const target = gatewayUrl ? `${gatewayUrl.replace(/\/$/, "")}/jobs` : "http://management-agent/jobs";
    const outgoing = new Request(target, { method: "POST", headers, body: JSON.stringify(job) });
    const response = tunnel ? await tunnel.fetch(outgoing) : await fetch(outgoing);
    if (!response.ok) return Response.json({ error: `Der Management-Agent hat den Auftrag abgelehnt (${response.status}).` }, { status: 502 });
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Der Auftrag ist ungültig." }, { status: 400 }); }
}
