import { strict as assert } from "node:assert";
import { test } from "node:test";
import { utils, write } from "xlsx";
import { readHrRows, parseCsv } from "../../lib/hr-import";
import { applyMasterData, buildAutomationJob, buildPowerShellPreview, defaultMasterData, failedAutomationAction, isoDate, parseRows } from "../../app/data";

const rows = [["Laufkarte Wechsel"], ["Vorname", "Jörg"], ["Name", "Müller"], ["Personalnummer", "TEST-42"], ["Unternehmen", "Denkingen"], ["Eintritt", "29.02.2024"], ["IT", "X", "E-Mail-Adresse"], ["IT", "X", "Notebook"], ["IT", "X", "VPN"]];
test("UTF-8 BOM and Windows-1252 preserve HR umlauts", () => {
  const csv = rows.map((row) => row.join(";")).join("\r\n");
  assert.equal(parseRows(readHrRows(new TextEncoder().encode("\uFEFF" + csv).buffer, "wechsel.csv"), "wechsel.csv").lastName, "Müller");
  const legacy = Uint8Array.from([...csv].map((ch) => ch.charCodeAt(0)));
  assert.equal(parseRows(readHrRows(legacy.buffer, "wechsel.csv"), "wechsel.csv").firstName, "Jörg");
});
test("quoted CSV preserves delimiters, escaped quotes and multiline cells", () => {
  assert.deepEqual(parseCsv('Name;"Müller; Jo"\r\nNotiz;"Zeile 1\n""Zitat"""'), [["Name", "Müller; Jo"], ["Notiz", 'Zeile 1\n"Zitat"']]);
  assert.throws(() => parseCsv('Name;"offen'), /Anführungszeichen/);
  assert.deepEqual(parseCsv('""'), [[""]]);
  assert.deepEqual(parseCsv('Name;""'), [["Name", ""]]);
});
for (const bookType of ["xls", "xlsx"] as const) test(`${bookType}: existing HR row layout and change detection`, () => {
  const workbook = utils.book_new(); utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), "HR");
  const bytes = write(workbook, { type: "array", bookType }) as ArrayBuffer;
  const person = parseRows(readHrRows(bytes, `wechsel.${bookType}`), `wechsel.${bookType}`);
  assert.equal(person.firstName, "Jörg"); assert.equal(person.events[0].type, "change"); assert.equal(person.startDate, "2024-02-29");
  assert.ok(buildAutomationJob(person).actions.some((action) => action.type === "UpdateAdUser"));
  assert.ok(!buildAutomationJob(person).actions.some((action) => action.type === "CreateAdUser"));
});
test("invalid dates reject impossible calendar values", () => {
  assert.equal(isoDate("29.02.2024"), "2024-02-29");
  assert.equal(isoDate("31/12/2026"), "2026-12-31");
  for (const value of ["31.02.2024", "29.02.2025", "2026-13-01", "irgendwann", "foo31.01.2026bar", "12/31/2026"]) assert.throws(() => isoDate(value), /Datum/);
});
test("Excel Date cells retain the HR calendar day in the local timezone", () => {
  const person = parseRows(rows.map((row) => row[0] === "Eintritt" ? ["Eintritt", new Date(2024, 1, 29)] : row), "date.xlsx");
  assert.equal(person.startDate, "2024-02-29");
});
test("master data changes group, OU, mailbox and task planning while preserving defaults", () => {
  const person = parseRows(rows.map((row, i) => i === 0 ? ["Laufkarte Eintritt"] : row), "eintritt.xlsx");
  const rules = defaultMasterData.map((item) => item.id === "group-vpn" ? { ...item, value: "TEST-VPN" } : item.id === "ou-pk-notebook" ? { ...item, value: "OU=Test,DC=example,DC=test" } : item.id === "app-mail" ? { ...item, active: false } : item.id === "task-notebook" ? { ...item, owner: "Testteam", value: "agent" } : item);
  const planned = applyMasterData(person, rules), job = buildAutomationJob(planned, {}, { masterData: rules });
  assert.ok(job.directory.suggestedGroups.includes("TEST-VPN"));
  assert.equal(job.directory.computers[0].targetOu, "OU=Test,DC=example,DC=test");
  assert.ok(!job.actions.some((action) => action.type === "ProvisionM365Mailbox"));
  assert.equal(planned.tasks.find((task) => /Notebook/.test(task.title))?.owner, "Testteam");
  assert.equal(job.actionTaskIds["CreateAdComputer:Notebook"].length, 1);
  assert.equal(job.actionServiceIds["CreateAdComputer:Notebook"].length, 1);
});
test("offboarding retains explicit manual M365 and HelpDesk follow-up", () => {
  const person = parseRows(rows, "offboarding.xlsx");
  person.events[0].type = "offboarding";
  const parsed = parseRows([["Laufkarte Austritt"], ...rows.slice(1)], "austritt.xlsx");
  assert.ok(parsed.tasks.some((task) => task.executionType === "manual" && /M365/.test(task.title)));
  assert.ok(parsed.tasks.some((task) => task.executionType === "manual" && /HelpDesk/.test(task.title)));
  assert.ok(!buildAutomationJob(parsed).actions.some((action) => /Mailbox|License/.test(action.type)));
});
test("retry selection uses persisted failed action results, never error text or uncertain effect", () => {
  const base = { id: "run", jobId: "job", operation: "execute" as const, mode: "Execute" as const, status: "partial", canRollback: false, startedAt: "2026-01-01", changes: [], error: "Fehler bei 'CreateAdUser'" };
  assert.equal(failedAutomationAction(base), "");
  assert.equal(failedAutomationAction({ ...base, actionResults: [{ action: "CreateAdUser", status: "completed" }, { action: "ProvisionM365Mailbox", status: "failed" }] }), "ProvisionM365Mailbox");
  assert.equal(failedAutomationAction({ ...base, actionResults: [{ action: "CreateHelpdeskTicket", status: "review_required" }] }), "");
});
test("manual account rule suppresses user mutation; separate AD computer rule preserves physical delivery", () => {
  const person = parseRows(rows.map((row, i) => i === 0 ? ["Laufkarte Eintritt"] : row), "eintritt.xlsx");
  const physical = applyMasterData(person, defaultMasterData);
  assert.equal(physical.tasks.find((task) => /Notebook/.test(task.title))?.executionType, "manual");
  assert.ok(buildAutomationJob(physical).actions.some((action) => action.type === "CreateAdComputer:Notebook"));
  const rules = defaultMasterData.map((item) => item.id === "task-account" ? { ...item, value: "manual" } : item.id === "task-computer-notebook" ? { ...item, active: false } : item);
  const job = buildAutomationJob(applyMasterData(person, rules), {}, { masterData: rules });
  assert.ok(!job.actions.some((action) => action.type === "CreateAdUser"));
  assert.ok(!job.actions.some((action) => /AdComputer:Notebook$/.test(action.type)));
  assert.ok(!buildAutomationJob({ ...person, events: [{ ...person.events[0], type: "change" }] }, {}, { masterData: rules }).actions.some((action) => action.type === "UpdateAdUser"));
});
test("stored directory identity and latest event override renamed HR-derived identity and old tasks", () => {
  const person = parseRows(rows, "wechsel.xlsx");
  const task = person.tasks[0];
  person.tasks = [{ ...task, id: "old", lifecycleEventId: "previous" }, { ...task, id: "current", lifecycleEventId: person.events[0].id }];
  person.directoryObjectGuid = "GUID-IMMUTABLE"; person.directorySamAccountName = "existing.account"; person.directoryUpn = "existing@example.test";
  const job = buildAutomationJob(person);
  assert.equal(job.directory.objectGuid, "GUID-IMMUTABLE"); assert.equal(job.directory.samAccountName, "existing.account"); assert.equal(job.directory.userPrincipalName, "existing@example.test");
  assert.deepEqual(job.actionTaskIds.ProvisionM365Mailbox, ["current"]);
});
test("new locations and OU labels work with UI generated ids, ambiguity and inactive application block planning", () => {
  const person = parseRows(rows.map((row, index) => index === 0 ? ["Laufkarte Eintritt"] : row[0] === "Unternehmen" ? ["Unternehmen", "Neustadt"] : row), "eintritt.xlsx");
  const additions = [{ id: "location-123", kind: "location" as const, label: "Neustadt", value: "NS", owner: "IT", active: true }, { id: "ou-123", kind: "ou" as const, label: "Neustadt · Notebook", value: "OU=Notebook,DC=test,DC=local", owner: "IT", active: true }, { id: "app-vpn", kind: "application" as const, label: "VPN", value: "VPN", owner: "IT", active: false }];
  const job = buildAutomationJob(person, {}, { masterData: additions });
  assert.equal(job.directory.computers[0].targetOu, "OU=Notebook,DC=test,DC=local"); assert.ok(!job.actions.some((action) => action.type.startsWith("AddGroup:VPN")));
  assert.equal(buildAutomationJob(person, {}, { masterData: [...additions, { ...additions[1], id: "ou-duplicate" }] }).directory.computers[0].targetOu, "REVIEW_REQUIRED");
});
test("open task rule changes apply immediately; completed tasks preserve execution history", () => {
  const person = parseRows(rows, "wechsel.xlsx");
  const account = { ...person.tasks[0], id: "account", title: "Benutzerkonto anlegen", executionType: "simulated" as const, status: "ready" as const };
  person.tasks = [account, { ...account, id: "done", status: "done" }];
  const result = applyMasterData(person, [{ id: "task-account", kind: "task", label: "Benutzerkonto anlegen", value: "manual", owner: "Prüfteam", active: true }]);
  assert.equal(result.tasks[0].executionType, "manual"); assert.equal(result.tasks[0].status, "open"); assert.equal(result.tasks[1].executionType, "simulated"); assert.equal(result.tasks[1].status, "done");
});

test("exact AD computer task rule wins over generic physical notebook delivery", () => {
  const person = parseRows(rows.map((row, index) => index === 0 ? ["Laufkarte Eintritt"] : row), "eintritt.xlsx");
  person.tasks.push({ id: "ad-computer", eventType: "onboarding", title: "AD-Notebook anlegen / übernehmen", owner: "IT", executionType: "manual", status: "open" });
  const result = applyMasterData(person, defaultMasterData);
  assert.equal(result.tasks.find((task) => task.id === "ad-computer")?.executionType, "simulated");
  assert.equal(result.tasks.find((task) => task.title === "Notebook bereitstellen")?.executionType, "manual");
  assert.deepEqual(buildAutomationJob(result).actionTaskIds["CreateAdComputer:Notebook"], ["ad-computer"]);
});

test("mailbox action target follows configured and stored mail identity", () => {
  const person = parseRows(rows, "wechsel.xlsx");
  assert.equal(buildAutomationJob(person, {}, { mailDomain: "example.test" }).actions.find((action) => action.type === "ProvisionM365Mailbox")?.target, "joerg.mueller@example.test · Microsoft 365 Business Premium");
  person.directoryUpn = "existing@example.test";
  assert.equal(buildAutomationJob(person).actions.find((action) => action.type === "ProvisionM365Mailbox")?.target, "existing@example.test · Microsoft 365 Business Premium");
});

test("downloaded preview follows actual change rules and directs execution through persistent gateway jobs", () => {
  const person = parseRows(rows, "wechsel.xlsx");
  const rules = defaultMasterData.map((item) => item.id === "task-account" ? { ...item, value: "manual" } : item);
  const job = buildAutomationJob(person, {}, { masterData: rules });
  const preview = buildPowerShellPreview(person, job);
  assert.ok(preview.includes("Windows-Gateway"));
  assert.ok(preview.includes("Server speichert Auftrag und Ergebnis dauerhaft"));
  assert.ok(!preview.includes("CreateAdUser"));
  assert.ok(!preview.includes("UpdateAdUser"));
  assert.ok(!/New-ADUser|Set-ADUser|Invoke-RestMethod|Get-Credential|param\(/.test(preview));
  for (const action of job.actions) assert.ok(preview.includes(`${action.type}: ${action.target}`));
});

test("exact manual and inactive task rules suppress mailbox and group execution", () => {
  const person = parseRows(rows.map((row, index) => index === 0 ? ["Laufkarte Eintritt"] : row), "eintritt.xlsx");
  for (const setting of [{ active: true, value: "manual" }, { active: false, value: "agent" }]) {
    const rules = [
      { id: "task-custom-mail", kind: "task" as const, label: "E-Mail-Adresse bereitstellen", owner: "IT", ...setting },
      { id: "task-custom-vpn", kind: "task" as const, label: "VPN bereitstellen", owner: "IT", ...setting },
      { id: "task-custom-delivery", kind: "task" as const, label: "Notebook bereitstellen", owner: "IT", ...setting },
    ];
    const planned = applyMasterData(person, rules);
    assert.equal(planned.tasks.find((task) => /E-Mail-Adresse/.test(task.title))?.executionType, "manual");
    assert.equal(planned.tasks.find((task) => /VPN/.test(task.title))?.executionType, "manual");
    const job = buildAutomationJob(planned, {}, { masterData: rules });
    assert.ok(!job.actions.some((action) => action.type === "ProvisionM365Mailbox"));
    assert.ok(!job.actions.some((action) => action.type === "AddGroup:VPNUser_Mitarbeiter_GG"));
    assert.ok(job.actions.some((action) => action.type === "CreateAdComputer:Notebook"));
    assert.ok(job.actions.some((action) => action.type === "CreateAdUser"));
  }
});

test("offboarding group removal maps AD access while external application follow-up stays manual", () => {
  const person = parseRows([
    ["Laufkarte Austritt"], ...rows.slice(1, 6),
    ["AD-Gruppenmitgliedschaften entfernen", "", "", "", "IT"],
    ["Habel Account löschen", "", "", "", "IT"],
  ], "austritt.xlsx");
  person.services.push(...["VPN", "Internetzugang", "Habel", "CAQ", "Infor LN"].map((label) => ({ id: `existing-${label}`, key: label, label, category: "Anwendung", status: "active" as const, source: "Vorheriges Onboarding" })));
  const job = buildAutomationJob(person);
  assert.deepEqual(job.actionServiceIds.RemoveGroupMemberships, ["existing-VPN", "existing-Internetzugang"]);
  assert.deepEqual(job.actionTaskIds.RemoveGroupMemberships, [person.tasks.find((task) => task.title === "AD-Gruppenmitgliedschaften entfernen")?.id]);
  assert.equal(person.tasks.find((task) => task.title === "Habel Account löschen")?.executionType, "manual");
  assert.ok(!job.actionServiceIds.RemoveGroupMemberships.includes("existing-Habel"));
});

test("job IDs stay safe and unique for valid HR personnel numbers with unicode or punctuation", () => {
  const person = parseRows(rows.map((row) => row[0] === "Personalnummer" ? ["Personalnummer", "HR / Ä-42"] : row), "wechsel.xlsx");
  const first = buildAutomationJob(person), second = buildAutomationJob(person);
  assert.match(first.jobId, /^[a-zA-Z0-9_-]+$/);
  assert.notEqual(first.jobId, second.jobId);
  assert.equal(first.person.personnelNumber, "HR / Ä-42");
});
