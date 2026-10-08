import { env } from "cloudflare:workers";
import { sameOrigin, sessionCookie, type AuthSettings } from "../../../../lib/local-auth";

export async function POST(request: Request) {
  const settings = env as unknown as AuthSettings;
  if (!sameOrigin(request, settings)) return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store", "set-cookie": sessionCookie("", settings, request) } });
}
