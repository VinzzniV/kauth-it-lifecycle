import { env } from "cloudflare:workers";
import { createSession, credentialsMatch, sameOrigin, sessionCookie, type AuthSettings } from "../../../../lib/local-auth";

// Bound failed attempts for the configured local account in this worker instance.
let failures = 0;
let windowUntil = 0;
export async function POST(request: Request) {
  const settings = env as unknown as AuthSettings;
  const reply = (data: object, status: number, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
  if (settings.LOCAL_BASIC_AUTH_ENABLED !== "true" || !settings.APP_USERNAME || !settings.APP_PASSWORD) return reply({ error: "Die Anmeldung ist nicht konfiguriert. Bitte die IT kontaktieren." }, 503);
  if (!sameOrigin(request, settings)) return reply({ error: "Diese Anmeldung wurde nicht von der Anwendung gesendet." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Ungültige Anfrage." }, 400);
  const now = Date.now();
  if (now >= windowUntil) { failures = 0; windowUntil = now + 60_000; }
  if (failures >= 10) return reply({ error: "Zu viele Anmeldeversuche. Bitte in einer Minute erneut versuchen." }, 429, { "retry-after": String(Math.max(1, Math.ceil((windowUntil - now) / 1000))) });
  let data: { username?: unknown; password?: unknown };
  try {
    const text = await request.text();
    if (text.length > 4096) return reply({ error: "Ungültige Anfrage." }, 400);
    data = JSON.parse(text);
    if (!data || typeof data !== "object") throw new Error();
  } catch { return reply({ error: "Ungültige Anfrage." }, 400); }
  if (typeof data.username !== "string" || typeof data.password !== "string") return reply({ error: "Benutzername und Passwort sind erforderlich." }, 400);
  failures++;
  if (!await credentialsMatch(data.username, data.password, settings)) return reply({ error: "Benutzername oder Passwort ist nicht korrekt." }, 401);
  failures = 0;
  return reply({ ok: true }, 200, { "set-cookie": sessionCookie(await createSession(settings), settings, request) });
}
