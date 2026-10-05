import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

// Only synthetic credentials, local adapters, uniquely named containers/volumes.
const root = process.cwd();
const id = `v1-${Date.now()}`;
const evidence = path.join(root, "work", id);
mkdirSync(evidence, { recursive: true });
const queue = path.join(evidence, "queue");
const statePath = path.join(evidence, "adapter.json");
const envPath = path.join(evidence, ".env");
const image = process.env.TEST_IMAGE || "kauth/it-lifecycle:v1-candidate";
const container = `it-lifecycle-${id}`;
const restoredContainer = `${container}-restored`;
const volume = `it_lifecycle_${id}`;
const restoredVolume = `${volume}_restored`;
const web = "http://127.0.0.1:18080";
const restoredWeb = "http://127.0.0.1:18083";
const gatewayUrl = "http://127.0.0.1:18788";
const token = "isolated-test-token";
const user = "test-admin", password = "isolated-test-password";
const basic = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const passed = [];
let gateway, browser;
let delayedGateway;
// Keep the CLI alive while Node 22's unreferenced fetch startup work is pending.
const keepAlive = setInterval(() => {}, 1000);
function docker(...args) {
  const response = spawnSync("docker", args, { encoding: "utf8", windowsHide: true });
  if (response.status) throw new Error(`Docker ${args[0]} failed: ${response.stderr}`);
  return response.stdout.trim();
}
function operation(command, sourceVolume, backupDirectory) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", path.join(root, "Manage-ItLifecycle.ps1"), "-Command", command, "-ConfigurationPath", envPath, "-Image", image, "-Volume", sourceVolume, "-BackupDirectory", backupDirectory], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Isolated ${command} failed: ${result.stderr}\n${result.stdout}`);
}
async function waitFor(check, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await new Promise((r) => setTimeout(r, 300)); }
  throw new Error(`Timed out: ${label}`);
}
async function api(route, method = "GET", body, authentication = basic, destination = web) {
  const response = await fetch(`${destination}${route}`, { method, headers: { "content-type": "application/json", authorization: authentication }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (response.status >= 500) console.error(`Isolated API ${route.split("?")[0]} returned ${response.status}: ${data.error || "unstructured response"}`);
  return { status: response.status, data };
}
async function runResult(jobId) {
  return waitFor(async () => { const r = await api(`/api/agent?jobId=${jobId}`); return r.status === 200 ? r.data : false; }, `durable result ${jobId}`);
}
function startGateway() {
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", path.join(root, "public/agent/Start-ItLifecycleGateway.ps1"), "-ListenPrefix", "http://+:18788/", "-QueuePath", queue, "-ConfigurationPath", envPath, "-TestAdapterPath", path.join(root, "tests/powershell/TestAdapter.ps1")], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (data) => writeFileSync(path.join(evidence, "gateway.log"), data, { flag: "a" }));
  child.stderr.on("data", (data) => writeFileSync(path.join(evidence, "gateway-error.log"), data, { flag: "a" }));
  return child;
}
async function stopGateway() {
  const child = gateway; gateway = null;
  if (child && child.exitCode === null && child.signalCode === null) {
    const ended = once(child, "exit"); child.kill(); await ended;
  }
}
function state() { return JSON.parse(readFileSync(statePath, "utf8").replace(/^\uFEFF/, "")); }
function saveState(value) { writeFileSync(statePath, JSON.stringify(value)); }
async function people() { const r = await api("/api/employees"); assert.equal(r.status, 200); return r.data.employees; }

try {
  const groups = ["Denkingen_Alle_Benutzer_GG", "Denkingen_MailSignatur_KauthDenkingen_GG"].map((name, index) => ({ Name: name, SamAccountName: name, DistinguishedName: `CN=${name},OU=Groups,DC=kauth,DC=local`, ObjectGUID: `11111111-1111-1111-1111-11111111111${index}` }));
  saveState({ mutations: 0, users: [], computers: [], tickets: [], groups, cloudUser: { Id: "cloud-test", UserPrincipalName: "joerg.mueller@kauth.de", UsageLocation: "DE", AssignedLicenses: [] }, sku: { SkuId: "sku-test", SkuPartNumber: "SPB", PrepaidUnits: { Enabled: 2, Warning: 0 }, ConsumedUnits: 2 } });
  writeFileSync(envPath, [`IT_LIFECYCLE_TEST_MODE=1`, `IT_LIFECYCLE_TEST_STATE=${statePath}`, "IT_LIFECYCLE_TEST_DELAY_SECONDS=8", `MANAGEMENT_AGENT_TOKEN=${token}`, `IT_LIFECYCLE_WEB_URL=${web}`, "M365_TENANT_ID=test", "M365_CLIENT_ID=test", "M365_CERT_THUMBPRINT=test", "M365_ORGANIZATION=test"].join("\n"));
  docker("volume", "create", volume);
  const overlay = process.env.TEST_SOURCE_OVERLAY === "1" ? ["dist", "drizzle", "public", "scripts"].flatMap((directory) => ["-v", `${path.join(root, directory)}:/app/${directory}:ro`]) : [];
  docker("run", "-d", "--name", container, "-p", "127.0.0.1:18080:8080", "--add-host", "host.docker.internal:host-gateway", "-v", `${volume}:/data`, ...overlay, "-e", "LOCAL_BASIC_AUTH_ENABLED=true", "-e", `APP_USERNAME=${user}`, "-e", `APP_PASSWORD=${password}`, "-e", `MANAGEMENT_AGENT_TOKEN=${token}`, "-e", "MANAGEMENT_AGENT_URL=http://host.docker.internal:18788", "-e", `IT_LIFECYCLE_WEB_URL=${web}`, image);
  await waitFor(async () => { try { return (await fetch(`${web}/api/health`, { signal: AbortSignal.timeout(5000) })).ok; } catch { return false; } }, "isolated Docker web health");
  gateway = startGateway();
  await waitFor(async () => { try { return (await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(5000) })).ok; } catch { return false; } }, "isolated gateway health");
  assert.equal((await api("/api/employees", "GET", undefined, "")).status, 401);
  assert.equal((await api("/api/gateway/results", "POST", {}, basic)).status, 401);
  const rejectedReceipt = await api("/api/executions", "POST", {});
  assert.equal(rejectedReceipt.status, 403, JSON.stringify(rejectedReceipt.data));
  const diagnostics = await api("/api/diagnostics");
  assert.equal(diagnostics.status, 200);
  assert.equal(diagnostics.data.revision, docker("image", "inspect", image, "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}'));
  assert.equal(diagnostics.data.database, "ok"); assert.equal(diagnostics.data.gateway, "ok");
  assert.equal(diagnostics.data.authentication, "enabled");
  passed.push("Docker web/gateway healthy; browser cannot forge gateway results");
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ httpCredentials: { username: user, password }, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(e.message));
  await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/employees") && r.status() === 200), page.goto(web)]);
  await page.getByRole("button", { name: "Datei einlesen", exact: true }).click();
  const csv = 'Laufkarte Eintritt\r\nVorname;Jörg\r\nName;Müller\r\nPersonalnummer;TEST-ACCEPTANCE\r\nUnternehmen;Denkingen\r\nAbteilung;IT\r\nEintritt;02.10.2026\r\nIT;X;Benutzerkonto\r\nIT;X;E-Mail-Adresse\r\nIT;X;Notebook';
  await page.locator('input[type="file"]').setInputFiles({ name: "eintritt-test.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Eintrag anlegen", exact: true }).click();
  const person = await waitFor(async () => (await people()).find((p) => p.personnelNumber === "TEST-ACCEPTANCE"), "browser HR import");
  assert.equal(person.firstName, "Jörg"); assert.equal(person.lastName, "Müller");
  assert.equal((await api("/api/employees", "PATCH", { employeeId: person.id, directoryTargetOu: "OU=Isolated,DC=kauth,DC=local" })).status, 200);
  for (const route of ["/mitarbeiter", "/aufgaben", "/automationen", "/stammdaten", "/diagnose"]) {
    await page.goto(web + route); await page.waitForTimeout(500);
    const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(size.content <= size.viewport + 2, `${route} horizontal overflow ${size.content}`);
  }
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  await page.screenshot({ path: path.join(evidence, "mobile.png"), fullPage: true });
  passed.push("Real browser: UTF8 HR import, saved employee, mobile navigation and five views without overflow");
  const credential = { username: "test", password: "test-secret" };
  const submit = (jobId, mode, extra = {}) => api("/api/agent", "POST", { schemaVersion: 1, operation: "execute", jobId, requestedMode: mode, executeApproved: mode === "Execute", person: { employeeId: person.id }, adCredential: credential, helpdeskCredential: credential, initialPassword: "test-secret", ...extra });
  const dryId = `dry-${id}`;
  const drySubmission = await submit(dryId, "WhatIf");
  assert.equal(drySubmission.status, 200, JSON.stringify(drySubmission.data));
  const dry = await runResult(dryId); assert.equal(dry.status, "completed"); assert.equal(state().mutations, 0);
  assert.ok((await people())[0].tasks.every((t) => t.status !== "done"));
  passed.push("WhatIf result durable; no adapter mutation or completed task");
  const executeId = `execute-${id}`;
  const competing = await Promise.all([submit(executeId, "Execute"), submit(executeId, "Execute")]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409], JSON.stringify(competing));
  assert.equal((await submit(`concurrent-${id}`, "Execute")).status, 409);
  assert.equal((await api("/api/employees", "DELETE", { employeeId: person.id })).status, 409);
  await waitFor(() => existsSync(path.join(queue, `${executeId}.state.json`)) && JSON.parse(readFileSync(path.join(queue, `${executeId}.state.json`), "utf8").replace(/^\uFEFF/, "")).status === "running", "agent process running");
  await browser.close(); browser = null;
  await stopGateway(); gateway = startGateway();
  const result = await runResult(executeId);
  assert.ok(["partial", "failed"].includes(result.status), JSON.stringify(result));
  assert.equal(result.actionResults.find((a) => a.action === "CreateAdUser").status, "completed");
  assert.equal(result.actionResults.find((a) => a.action === "ProvisionM365Mailbox").status, "failed");
  assert.equal(state().users.length, 1); assert.equal(state().computers.length, 1); assert.equal(state().tickets.length, 1);
  const beforeRetry = state().mutations;
  const duplicate = await api("/api/gateway/results", "POST", result, `Bearer ${token}`);
  assert.equal(duplicate.status, 200); assert.equal(duplicate.data.duplicate, true);
  assert.equal((await api("/api/gateway/results", "POST", { ...result, employeeId: "forged" }, `Bearer ${token}`)).status, 409);
  passed.push("Browser closed + gateway restarted: partial result imported; duplicate idempotent; forged employee rejected; concurrent start/deletion blocked");
  const available = state(); available.sku.ConsumedUnits = 0; saveState(available);
  const retryId = `retry-${id}`;
  assert.equal((await submit(retryId, "Execute", { retryOfRunId: executeId, retryAction: "CreateAdUser" })).status, 409);
  assert.equal((await submit(retryId, "Execute", { retryOfRunId: executeId, retryAction: "ProvisionM365Mailbox" })).status, 200);
  const retry = await runResult(retryId); assert.equal(retry.status, "completed"); assert.equal(retry.actionResults.length, 1);
  assert.equal(state().users.length, 1); assert.equal(state().computers.length, 1); assert.equal(state().tickets.length, 1); assert.equal(state().mutations, beforeRetry + 2);
  const updated = (await people()).find((p) => p.id === person.id);
  const savedRunProjection = updated.automationRuns.find((run) => run.id === executeId);
  assert.ok(savedRunProjection.plannedActions.some((action) => action.type === "ProvisionM365Mailbox"));
  assert.equal(savedRunProjection.targetAccount, "joerg.mueller@kauth.de");
  assert.ok(!("jobJson" in savedRunProjection));
  assert.deepEqual(savedRunProjection.alreadyReversedChangeIds, []);
  assert.equal(updated.tasks.find((t) => /E-Mail/.test(t.title)).status, "done");
  passed.push("License shortage single retry provisions mailbox and completes email task without duplicate user/ticket");
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const internal = await browser.newContext({ httpCredentials: { username: user, password }, viewport: { width: 1440, height: 1000 } });
  const tasksPage = await internal.newPage();
  await tasksPage.goto(web + "/aufgaben");
  for (const task of updated.tasks.filter((t) => t.executionType === "manual" && t.status !== "done")) {
    await tasksPage.getByRole("checkbox", { name: `${task.title} erledigen`, exact: true }).click();
    await waitFor(async () => (await people())[0].tasks.find((t) => t.id === task.id)?.status === "done", "manual task completion");
  }
  const completed = (await people())[0];
  assert.equal(completed.status, "completed"); assert.ok(completed.tasks.every((t) => t.status === "done"));
  await tasksPage.goto(web);
  await tasksPage.getByText("Keine offenen Vorgänge. Abgeschlossene Akten bleiben unter", { exact: false }).waitFor();
  await tasksPage.goto(web + "/mitarbeiter");
  await tasksPage.getByText("Jörg Müller", { exact: true }).click();
  for (const tab of ["Ausstattung & Bestand", "Aufgaben", "Automation", "Historie"]) await tasksPage.getByRole("tab", { name: tab, exact: true }).click();
  await tasksPage.screenshot({ path: path.join(evidence, "employee-desktop.png"), fullPage: true });
  const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const publicPage = await publicContext.newPage();
  await publicPage.goto(web + `/status/${updated.shareToken}`);
  await publicPage.getByText("Jörg Müller", { exact: true }).waitFor();
  assert.ok(await publicPage.getByRole("checkbox").evaluateAll((items) => items.every((item) => item.hasAttribute("disabled") || item.getAttribute("aria-disabled") === "true")));
  passed.push("Internal browser completes manual tasks; finished case leaves open overview, employee tabs and public read-only view remain available");
  const tokenView = await api(`/api/public/status?token=${updated.shareToken}`, "GET", undefined, "");
  assert.equal(tokenView.status, 200, JSON.stringify(tokenView.data)); assert.ok(!JSON.stringify(tokenView.data).includes("personnelNumber"));
  assert.equal((await api("/api/public/status", "PATCH", { token: updated.shareToken }, "")).status, 405);
  assert.equal((await api("/api/employees", "PATCH", { employeeId: person.id, shareAction: "revoke" })).status, 200);
  assert.equal((await api(`/api/public/status?token=${updated.shareToken}`, "GET", undefined, "")).status, 404);
  passed.push("Public token has read-only limited view and revocation");
  const rollbackDry = await api("/api/executions", "PATCH", { runId: executeId, mode: "WhatIf", adCredential: credential });
  const beforeDryRollback = state().mutations;
  assert.equal(rollbackDry.status, 200); assert.equal((await runResult(rollbackDry.data.jobId)).status, "completed");
  assert.equal(state().users.length, 1);
  assert.equal(state().mutations, beforeDryRollback);
  assert.notEqual((await people())[0].automationRuns.find((r) => r.id === executeId).status, "rolled_back");
  assert.deepEqual((await people())[0].automationRuns.find((r) => r.id === executeId).alreadyReversedChangeIds, []);
  const rollback = await api("/api/executions", "PATCH", { runId: executeId, mode: "Execute", executeApproved: true, adCredential: credential });
  assert.equal(rollback.status, 200); assert.equal((await runResult(rollback.data.jobId)).status, "completed"); assert.equal(state().users.length, 0); assert.equal(state().computers.length, 0);
  assert.ok((await people())[0].automationRuns.find((r) => r.id === executeId).alreadyReversedChangeIds.length > 0);
  passed.push("GUID rollback simulation leaves source intact; Execute reverts supported user change");
  await tasksPage.goto(web);
  await tasksPage.getByRole("button", { name: "Datei einlesen", exact: true }).click();
  assert.equal((await api("/api/employees", "PATCH", { employeeId: person.id, directoryReferenceUser: "Vorherige Referenz" })).status, 200);
  await tasksPage.locator('input[type="file"]').setInputFiles({ name: "wechsel-test.csv", mimeType: "text/csv", buffer: Buffer.from(csv.replace("Laufkarte Eintritt", "Laufkarte Wechsel").replace("Abteilung;IT", "Abteilung;Entwicklung") + '\r\nIT;X;Zugänge wie MA: Neue Referenz') });
  await tasksPage.getByText("Wechsel", { exact: true }).waitFor();
  await tasksPage.getByRole("button", { name: "Eintrag anlegen", exact: true }).click();
  const changed = await waitFor(async () => { const p = (await people())[0]; return p.events.length === 2 ? p : false; }, "change import retains employee file");
  assert.equal(changed.id, person.id); assert.equal(changed.events[0].type, "change"); assert.equal(changed.department, "Entwicklung");
  assert.equal(changed.directoryReferenceUser, "Neue Referenz"); assert.equal(changed.directoryReferenceStatus, "pending"); assert.equal(changed.directoryTargetOu, "");
  assert.ok(changed.automationRuns.some((r) => r.id === executeId));
  assert.equal((await api("/api/master-data", "DELETE", { id: "group-vpn" })).status, 200);
  const rule = (await api("/api/master-data")).data.items.find((r) => r.id === "group-vpn");
  assert.equal(rule.kind, "group"); assert.equal(rule.label, "VPN Mitarbeiter"); assert.equal(rule.active, false);
  for (const route of ["/api/employees", "/api/agent", "/api/master-data", "/api/reference-check"]) assert.equal((await api(route, "POST", {})).status, 400, route);
  passed.push("Change CSV keeps the same employee/history; default group deactivation retains rule identity; malformed API requests return 400");
  // Reproduce a completed callback arriving before the /jobs response times out.
  await stopGateway();
  delayedGateway = createServer(async (request, response) => {
    if (request.url !== "/jobs") { response.writeHead(200, { "content-type": "application/json" }); response.end('{"status":"ok"}'); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const job = JSON.parse(Buffer.concat(chunks).toString()); const now = new Date().toISOString();
    const receipt = { schemaVersion: 1, jobId: job.jobId, runId: job.jobId, employeeId: job.person.employeeId, operation: job.operation, mode: job.requestedMode, status: "completed", startedAt: now, completedAt: now, automationTaskIds: [], changes: [], actionResults: (job.actions ?? []).map((action) => ({ action: action.type, status: "simulated" })), ...(job.operation === "reference_check" ? { referenceLookup: { query: job.directory.referenceUser.query, status: "found", count: 1, samAccountName: "new.reference", displayName: "Neue Referenz", targetOu: "OU=Test,DC=kauth,DC=local" } } : {}) };
    const delivered = await api("/api/gateway/results", "POST", receipt, `Bearer ${token}`);
    assert.equal(delivered.status, 200, JSON.stringify(delivered));
    setTimeout(() => { response.writeHead(202, { "content-type": "application/json" }); response.end('{"accepted":true}'); }, 17000);
  });
  delayedGateway.listen(18788, "0.0.0.0"); await once(delayedGateway, "listening");
  const raceId = `response-race-${id}`;
  const lateSubmission = await submit(raceId, "WhatIf");
  assert.equal(lateSubmission.status, 202); assert.equal(lateSubmission.data.status, "completed");
  assert.equal((await people())[0].automationRuns.find((r) => r.id === raceId).status, "completed");
  assert.equal((await runResult(raceId)).status, "completed");
  const referenceRace = await api("/api/reference-check", "POST", { employeeId: person.id, referenceUser: "Neue Referenz", adCredential: credential });
  assert.equal(referenceRace.status, 202); assert.equal(referenceRace.data.status, "completed");
  assert.equal((await runResult(referenceRace.data.jobId)).referenceLookup.status, "found");
  assert.equal((await people())[0].directoryReferenceStatus, "found");
  delayedGateway.closeAllConnections(); await new Promise((resolve) => delayedGateway.close(resolve)); delayedGateway = null;
  passed.push("A lost dispatch response after authenticated completion cannot overwrite the durable completed state");
  const backupRoot = path.join(evidence, "backup"); mkdirSync(backupRoot);
  docker("stop", container);
  operation("Backup", volume, backupRoot);
  assert.deepEqual(readdirSync(backupRoot).sort(), ["database.sqlite", "manifest.json"]);
  operation("Restore", restoredVolume, backupRoot);
  // A restored WAL database may create SQLite lock sidecars during its first read.
  const verification = docker("run", "--rm", "--network", "none", "-v", `${restoredVolume}:/data`, image, "node", "-e", "const fs=require('node:fs'),p=require('node:path'),{DatabaseSync}=require('node:sqlite');function find(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=p.join(d,e.name);if(e.isDirectory()){const r=find(q);if(r)return r;}else if(q.endsWith('.sqlite')&&e.name!=='metadata.sqlite')return q;}}const db=new DatabaseSync(find('/data'),{readOnly:true});console.log(JSON.stringify({check:db.prepare('PRAGMA quick_check').get().quick_check,employees:db.prepare('SELECT count(*) AS n FROM employees').get().n,receipts:db.prepare('SELECT count(*) AS n FROM automation_receipts').get().n}));db.close();");
  const verified = JSON.parse(verification); assert.equal(verified.check, "ok"); assert.equal(verified.employees, 1); assert.ok(verified.receipts >= 5);
  docker("run", "-d", "--name", restoredContainer, "-p", "127.0.0.1:18083:8080", "-v", `${restoredVolume}:/data`, ...overlay, "-e", "LOCAL_BASIC_AUTH_ENABLED=true", "-e", `APP_USERNAME=${user}`, "-e", `APP_PASSWORD=${password}`, image);
  await waitFor(async () => { try { return (await fetch(`${restoredWeb}/api/health`, { signal: AbortSignal.timeout(5000) })).ok; } catch { return false; } }, "restored web health");
  const restoredResponse = await fetch(`${restoredWeb}/api/employees`, { headers: { authorization: basic }, signal: AbortSignal.timeout(20000) });
  assert.equal(restoredResponse.status, 200);
  const restoredPeople = (await restoredResponse.json()).employees;
  assert.equal(restoredPeople.length, 1); assert.equal(restoredPeople[0].id, person.id); assert.equal(restoredPeople[0].events.length, 2);
  assert.equal(restoredPeople[0].directoryReferenceStatus, "found");
  const logs = docker("logs", container); assert.ok(!logs.includes(updated.shareToken));
  assert.ok(!logs.includes(token)); assert.ok(!logs.includes(password));
  passed.push("Consistent backup restored in distinct volume; employee/receipts preserved, integrity ok; logs exclude tokens and passwords");
  const referenceRecord = {
    id: "ui-reference-api", personnelNumber: "UI-REFERENCE-API", firstName: "Test", lastName: "Referenzakte", company: "Testbetrieb", department: "IT", jobTitle: "Test", status: "pending", directoryReferenceUser: "Test Referenz", directoryReferenceStatus: "pending",
    services: [
      { id: "ref-service", key: "reference", label: "Oder wie MA: Test Referenz", category: "Anwendung", status: "requested", source: "synthetic-reference.csv" },
      { id: "ref-notebook", key: "notebook", label: "Notebook", category: "Gerät", status: "requested", source: "synthetic-reference.csv" },
    ],
    tasks: [
      { id: "ref-task", eventType: "onboarding", title: "Oder wie MA: Test Referenz bereitstellen", owner: "IT", executionType: "simulated", status: "ready" },
      { id: "ref-device-task", eventType: "onboarding", title: "Notebook bereitstellen", owner: "IT", executionType: "manual", status: "open" },
    ],
    events: [{ id: "ref-event", type: "onboarding", status: "in_review", sourceFilename: "synthetic-reference.csv", importedAt: new Date().toISOString() }],
  };
  assert.equal((await api("/api/employees", "POST", referenceRecord, basic, restoredWeb)).status, 201);
  const referencePeople = await api("/api/employees", "GET", undefined, basic, restoredWeb);
  const preservedReference = referencePeople.data.employees.find((record) => record.personnelNumber === "UI-REFERENCE-API");
  assert.equal(preservedReference.services.length, 2); assert.equal(preservedReference.tasks.length, 2);
  const referencePublic = await api(`/api/public/status?token=${preservedReference.shareToken}`, "GET", undefined, "", restoredWeb);
  assert.equal(referencePublic.status, 200, JSON.stringify(referencePublic.data));
  assert.equal(referencePublic.data.employee.referenceProfile, true);
  assert.equal(referencePublic.data.employee.services.length, 1); assert.equal(referencePublic.data.employee.tasks.length, 1);
  assert.ok(!JSON.stringify(referencePublic.data).includes("Test Referenz"));
  assert.ok(!JSON.stringify(referencePublic.data).includes("sourceFilename"));
  passed.push("Real isolated API: legacy reference services/tasks preserved internally, publicly projected as anonymous reference metadata without additional names; no reference job started");
  console.log(JSON.stringify({ status: "passed", passed, container, volume, restoredVolume, evidence }, null, 2));
  writeFileSync(path.join(evidence, "acceptance.json"), JSON.stringify({ status: "passed", passed, image, container, restoredContainer, volume, restoredVolume, verification: verified }, null, 2));
} catch (error) {
  const lastPage = browser?.contexts()[0]?.pages()[0];
  if (lastPage) {
    await lastPage.screenshot({ path: path.join(evidence, "failure.png"), fullPage: true });
    writeFileSync(path.join(evidence, "failure.html"), await lastPage.content());
  }
  writeFileSync(path.join(evidence, "failure.txt"), String(error.stack));
  console.error(`Acceptance failed; evidence ${evidence}`); throw error;
} finally {
  clearInterval(keepAlive);
  if (browser) await browser.close();
  await stopGateway();
  if (delayedGateway) { delayedGateway.closeAllConnections(); await new Promise((resolve) => delayedGateway.close(resolve)); }
  try { docker("stop", container); } catch { /* keep diagnostics if creation failed */ }
  try { docker("stop", restoredContainer); } catch { /* restore may not have been reached */ }
  // Containers and isolated volumes are retained as reviewable evidence.
}
