import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createSession, credentialsMatch, safeReturn, sameOrigin, sessionCookie, SESSION_COOKIE, SESSION_SECONDS, validSession } from "../../lib/local-auth";

const settings = { APP_USERNAME: "Test Üser", APP_PASSWORD: "synthetic-only:pässword", IT_LIFECYCLE_WEB_URL: "https://lifecycle.example" };
test("signed sessions expire and reject tampering, duplicate cookies and credential rotation", async () => {
  const now = Date.UTC(2026, 9, 8);
  const token = await createSession(settings, now);
  const cookie = `${SESSION_COOKIE}=${token}`;
  assert.equal(await validSession(cookie, settings, now), true);
  assert.equal(await validSession(`other=1; ${cookie}`, settings, now + 1000), true);
  assert.equal(await validSession(cookie, settings, now + SESSION_SECONDS * 1000), false);
  assert.equal(await validSession(cookie, settings, now - 1000), false);
  assert.equal(await validSession(cookie.replace("1.", "2."), settings, now), false);
  assert.equal(await validSession(cookie.slice(0, -4) + "AAAA", settings, now), false);
  assert.equal(await validSession(cookie, { ...settings, APP_PASSWORD: "rotated" }, now), false);
  assert.equal(await validSession(`${cookie}; ${cookie}`, settings, now), false);
  assert.equal(await validSession(null, settings, now), false);
  assert.equal(await validSession(`${SESSION_COOKIE}=garbage`, settings, now), false);
});
test("existing Unicode credentials work, wrong credentials never authenticate", async () => {
  assert.equal(await credentialsMatch(settings.APP_USERNAME, settings.APP_PASSWORD, settings), true);
  assert.equal(await credentialsMatch("Test User", settings.APP_PASSWORD, settings), false);
  assert.equal(await credentialsMatch(settings.APP_USERNAME, "wrong", settings), false);
  assert.equal(await credentialsMatch("", "", {}), false);
});
test("cookie flags follow the configured HTTPS endpoint; logout clears the same cookie", () => {
  const request = new Request("http://backend:8080/api/auth/login");
  assert.match(sessionCookie("token", settings, request), /HttpOnly; SameSite=Lax; Max-Age=28800; Secure$/);
  assert.match(sessionCookie("", settings, request), /Max-Age=0; Secure$/);
  assert.doesNotMatch(sessionCookie("token", { IT_LIFECYCLE_WEB_URL: "http://localhost" }, request), /Secure/);
});
test("cookie mutations require an explicit same origin; return destinations stay within the app", () => {
  const request = (origin?: string, site?: string) => new Request("http://backend:8080/api/auth/login", { headers: { ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) } });
  assert.equal(sameOrigin(request("https://lifecycle.example"), settings), true);
  assert.equal(sameOrigin(request("https://evil.example"), settings), false);
  assert.equal(sameOrigin(request(), settings), false);
  assert.equal(sameOrigin(request("https://lifecycle.example", "cross-site"), settings), false);
  assert.equal(safeReturn("/diagnose?test=1"), "/diagnose?test=1");
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/api/employees", "/../api/employees", "\n/diagnose"]) assert.equal(safeReturn(value), "/", value);
});
