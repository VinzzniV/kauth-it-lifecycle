import { env } from "cloudflare:workers";
import { apiError, resultSchema } from "../../../../lib/automation-contract";
import { importResult } from "../../../../lib/automation-store";

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!runtime.MANAGEMENT_AGENT_TOKEN || request.headers.get("authorization") !== `Bearer ${runtime.MANAGEMENT_AGENT_TOKEN}`)
    return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
  try {
    const text = await request.text();
    if (text.length > 2_000_000) return Response.json({ error: "Ergebnis zu groß." }, { status: 413 });
    return Response.json(await importResult(resultSchema.parse(JSON.parse(text))));
  } catch (error) { return apiError(error); }
}
