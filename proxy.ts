import { env } from "cloudflare:workers";
import { credentialsMatch, sameOrigin, validSession, type AuthSettings } from "./lib/local-auth";

export async function proxy(request: Request) {
  const runtime = env as unknown as AuthSettings;
  const url = new URL(request.url);
  if (url.pathname === "/api/gateway/results") {
    if (runtime.MANAGEMENT_AGENT_TOKEN && request.headers.get("authorization") === `Bearer ${runtime.MANAGEMENT_AGENT_TOKEN}`) return;
    return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
  }
  if (["/login", "/api/auth/login", "/api/auth/logout"].includes(url.pathname)) return;
  if (runtime.LOCAL_BASIC_AUTH_ENABLED !== "true") return;
  const expectedUser = runtime.APP_USERNAME;
  const expectedPassword = runtime.APP_PASSWORD;
  if (!expectedUser || !expectedPassword) return new Response("Lokaler Zugriffsschutz ist unvollständig konfiguriert.", { status: 503 });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && (request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.has("origin") && !sameOrigin(request, runtime)))) return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Basic ")) {
    try {
      const bytes = Uint8Array.from(atob(authorization.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const separator = decoded.indexOf(":");
      if (separator >= 0 && await credentialsMatch(decoded.slice(0, separator), decoded.slice(separator + 1), runtime)) return;
    } catch { /* Fall through to session authentication. */ }
  }
  if (await validSession(request.headers.get("cookie"), runtime)) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request, runtime)) return Response.json({ error: "Ungültiger Ursprung. Bitte die Anwendung neu öffnen." }, { status: 403 });
    return;
  }
  if (url.pathname.startsWith("/api/")) return Response.json({ error: "Die Sitzung ist abgelaufen. Bitte erneut anmelden." }, { status: 401, headers: { "cache-control": "no-store" } });
  return new Response(null, { status: 303, headers: { location: `/login?next=${encodeURIComponent(url.pathname + url.search)}`, "cache-control": "no-store" } });
}

export const config = { matcher: ["/((?!api/health|api/public/|status/|favicon.svg|_next/).*)"] };
