import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { apiError } from "../../../lib/automation-contract";
import { managementHealth } from "../../../lib/management-agent";

export async function GET() {
  try {
    await getDb().run(sql`SELECT 1`);
    const runtime = env as unknown as Record<string, string | undefined>;
    const gateway = await managementHealth().then(() => "ok").catch(() => "unavailable");
    return Response.json({ revision: runtime.GIT_REVISION ?? "development", database: "ok", gateway,
      authentication: runtime.LOCAL_BASIC_AUTH_ENABLED === "true" ? "enabled" : "disabled",
      pending: await getDb().all(sql`SELECT status, COUNT(*) AS count FROM automation_runs WHERE status IN ('queued','running','review_required') GROUP BY status`),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
