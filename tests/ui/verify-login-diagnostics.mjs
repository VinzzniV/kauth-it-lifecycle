import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { once } from "node:events";

const base = process.env.UI_AUTH_TEST_URL || "http://127.0.0.1:18086";
const output = "docs/ui-ux/login-diagnostics";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const errors = [], checks = [];
const credentials = { username: "test-admin", password: "isolated-test-password" };
// This adapter answers health only; no job submission or external integration.
const health = createServer((request, response) => { response.writeHead(request.url === "/health" && request.method === "GET" ? 200 : 403, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "ok", syntheticOnly: true })); });
health.listen(18789, "0.0.0.0"); await once(health, "listening");
const request = async (route, body, headers = {}) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json", origin: base, ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
try {
  const deadline = Date.now() + 120000;
  while (true) {
    try { if ((await fetch(base + "/api/health", { signal: AbortSignal.timeout(3000) })).ok) break; } catch { /* Startup health can close the first socket. */ }
    assert.ok(Date.now() < deadline, "isolated auth test web health");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal((await fetch(base + "/diagnose", { redirect: "manual" })).status, 303);
  const unauthorized = await fetch(base + "/api/diagnostics");
  assert.equal(unauthorized.status, 401); assert.equal(unauthorized.headers.get("www-authenticate"), null);
  assert.equal((await request("/api/auth/login", credentials, { origin: "https://evil.example" })).status, 403);
  const wrong = await request("/api/auth/login", { username: credentials.username, password: "wrong" });
  assert.equal(wrong.status, 401, await wrong.text());
  const auth = await request("/api/auth/login", credentials);
  assert.equal(auth.status, 200);
  const cookie = auth.headers.get("set-cookie").split(";")[0];
  assert.match(auth.headers.get("set-cookie"), /HttpOnly; SameSite=Lax; Max-Age=28800/);
  assert.equal((await fetch(base + "/api/diagnostics", { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + "/api/employees", { method: "POST", headers: { cookie, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" })).status, 403);
  assert.equal((await fetch(base + "/api/gateway/results", { method: "POST", headers: { cookie, origin: base, "content-type": "application/json" }, body: "{}" })).status, 401);
  assert.equal((await fetch(base + "/api/diagnostics", { headers: { cookie: cookie.slice(0, -4) + "AAAA" } })).status, 401);
  checks.push("API: page redirect, no browser challenge, invalid/cross-origin login, signed cookie, tamper rejection, cookie CSRF rejection, gateway bearer isolation");
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/diagnose");
    await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
    await page.keyboard.press("Tab"); assert.equal(await page.locator("#username").evaluate((el) => el === document.activeElement), true);
    await page.getByLabel("Benutzername", { exact: true }).fill(credentials.username);
    await page.keyboard.press("Tab"); assert.equal(await page.locator("#password").evaluate((el) => el === document.activeElement), true);
    await page.getByLabel("Passwort", { exact: true }).fill("wrong");
    await page.keyboard.press("Enter"); await page.getByRole("alert").waitFor();
    assert.equal(await page.getByLabel("Passwort", { exact: true }).inputValue(), "");
    await page.getByLabel("Passwort", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Passwort anzeigen", exact: true }).click();
    assert.equal(await page.locator("#password").getAttribute("type"), "text");
    await page.getByRole("button", { name: "Passwort verbergen", exact: true }).click();
    await page.screenshot({ path: `${output}/login-${width}.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.waitForURL(base + "/diagnose");
    await page.getByText("Alle geprüften Komponenten sind verfügbar", { exact: true }).waitFor();
    assert.ok(!(await page.evaluate(() => document.cookie)).includes("it_lifecycle_session"));
    const original = await context.cookies(); assert.ok(original.find((entry) => entry.name === "it_lifecycle_session" && entry.httpOnly && entry.sameSite === "Lax"));
    await page.getByRole("button", { name: "Aktualisieren", exact: true }).click();
    await page.getByText("Alle geprüften Komponenten sind verfügbar", { exact: true }).waitFor();
    assert.ok(await page.getByRole("link", { name: "Zur Übersicht", exact: true }).isVisible());
    await page.screenshot({ path: `${output}/diagnose-${width}.png`, fullPage: true, animations: "disabled" });
    const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth })); assert.ok(size.content <= size.viewport + 2);
    await page.route("**/api/diagnostics", (route) => route.fulfill({ json: { revision: "synthetic", database: "ok", gateway: "unavailable", authentication: "enabled", pending: [{ status: "review_required", count: 1 }] } }));
    await page.getByRole("button", { name: "Aktualisieren", exact: true }).click();
    await page.getByText("Eine Komponente benötigt Aufmerksamkeit", { exact: true }).waitFor();
    await page.getByText("Prüfung erforderlich", { exact: true }).last().waitFor();
    await page.route("**/api/diagnostics", (route) => route.fulfill({ status: 503, json: { error: "Synthetic failure" } }));
    await page.getByRole("button", { name: "Aktualisieren", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.getByText("Die angezeigten Werte stammen aus der letzten erfolgreichen Prüfung.", { exact: true }).waitFor();
    await Promise.all([page.waitForResponse((response) => response.url().endsWith("/api/employees") && response.status() === 200), page.getByRole("link", { name: "Zur Übersicht", exact: true }).click()]);
    await page.waitForURL(base + "/");
    await Promise.all([page.waitForResponse((response) => response.url().endsWith("/api/auth/logout") && response.status() === 200), page.getByRole("button", { name: "Abmelden", exact: true }).click()]);
    await page.waitForURL(base + "/login");
    assert.ok(!(await context.cookies()).some((entry) => entry.name === "it_lifecycle_session"));
    await page.goto(base + "/diagnose"); await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
    checks.push(`${width}x${height}: keyboard login, errors, visibility toggle, original destination, diagnostics status/refresh/unavailable/stale-error, return navigation, logout/access protection, no overflow`);
    await context.close();
  }
  for (let index = 0; index < 10; index++) assert.equal((await request("/api/auth/login", { username: "wrong", password: "wrong" })).status, 401);
  const limited = await request("/api/auth/login", credentials); assert.equal(limited.status, 429); assert.ok(limited.headers.get("retry-after"));
  checks.push("Failed-login limiter returns 429 and Retry-After after ten failed attempts");
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/evidence.json`, JSON.stringify({ status: "passed", checks, errors, syntheticOnly: true }, null, 2));
  console.log(JSON.stringify({ status: "passed", checks, errors }, null, 2));
} finally { await browser.close(); health.closeAllConnections(); await new Promise((resolve) => health.close(resolve)); }
