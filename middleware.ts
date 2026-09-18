import { env } from "cloudflare:workers";

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function middleware(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  if (runtime.LOCAL_BASIC_AUTH_ENABLED !== "true") return;
  const expectedUser = runtime.APP_USERNAME;
  const expectedPassword = runtime.APP_PASSWORD;
  if (!expectedUser || !expectedPassword) return new Response("Lokaler Zugriffsschutz ist unvollständig konfiguriert.", { status: 503 });
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = atob(authorization.slice(6));
      const separator = decoded.indexOf(":");
      if (separator >= 0 && safeEqual(decoded.slice(0, separator), expectedUser) && safeEqual(decoded.slice(separator + 1), expectedPassword)) return;
    } catch { /* Browser erhält unten erneut die Anmeldeaufforderung. */ }
  }
  return new Response("Anmeldung erforderlich.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="IT Lifecycle V1", charset="UTF-8"' } });
}

export const config = { matcher: ["/((?!api/health|favicon.svg|_next/).*)"] };
