const encoder = new TextEncoder();
export const SESSION_COOKIE = "it_lifecycle_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export type AuthSettings = Record<string, string | undefined>;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function unbase64url(value: string) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
}
async function signingKey(settings: AuthSettings) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(`it-lifecycle/session/v1\0${settings.APP_USERNAME}\0${settings.APP_PASSWORD}`));
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function credentialsMatch(user: string, password: string, settings: AuthSettings) {
  if (!settings.APP_USERNAME || !settings.APP_PASSWORD) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  const [actual, expected] = await Promise.all([digest(JSON.stringify([user, password])), digest(JSON.stringify([settings.APP_USERNAME, settings.APP_PASSWORD]))]);
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= actual[index] ^ expected[index];
  return mismatch === 0;
}
export async function createSession(settings: AuthSettings, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const payload = `1.${issued}.${issued + SESSION_SECONDS}.${base64url(crypto.getRandomValues(new Uint8Array(24)))}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(settings), encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}
export async function validSession(cookie: string | null, settings: AuthSettings, now = Date.now()) {
  if (!settings.APP_USERNAME || !settings.APP_PASSWORD) return false;
  const values = (cookie ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return false;
  const token = values[0].slice(SESSION_COOKIE.length + 1);
  if (!/^1\.\d{10}\.\d{10}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [version, issued, expires, nonce, signature] = token.split(".");
  const seconds = Math.floor(now / 1000);
  if (Number(issued) > seconds || Number(expires) <= seconds || Number(expires) - Number(issued) !== SESSION_SECONDS) return false;
  try {
    return await crypto.subtle.verify("HMAC", await signingKey(settings), unbase64url(signature), encoder.encode(`${version}.${issued}.${expires}.${nonce}`));
  } catch { return false; }
}
export function sessionCookie(value: string, settings: AuthSettings, request: Request) {
  const secure = new URL(settings.IT_LIFECYCLE_WEB_URL || request.url).protocol === "https:";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? SESSION_SECONDS : 0}${secure ? "; Secure" : ""}`;
}
export function sameOrigin(request: Request, settings: AuthSettings) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  const allowed = [new URL(request.url).origin];
  if (settings.IT_LIFECYCLE_WEB_URL) allowed.push(new URL(settings.IT_LIFECYCLE_WEB_URL).origin);
  return allowed.includes(origin);
}
export function safeReturn(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname === "/login" || url.pathname.startsWith("/api/")) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
