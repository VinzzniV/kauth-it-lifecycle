import { sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";

export async function GET() {
  try {
    await getDb().run(sql`SELECT 1`);
    const runtime = env as unknown as Record<string, string | undefined>;
    return Response.json({ status: "ok", version: "1.0.0", database: "ok", managementAgentConfigured: Boolean(runtime.MANAGEMENT_AGENT_URL || (env as unknown as { CUSTOMER_HTTP_MANAGEMENT_AGENT?: unknown }).CUSTOMER_HTTP_MANAGEMENT_AGENT) });
  } catch (error) {
    return Response.json({ status: "error", database: "unavailable", error: error instanceof Error ? error.message : "Datenbank nicht verfügbar" }, { status: 503 });
  }
}
