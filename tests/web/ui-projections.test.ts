import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAutomationJob, parseRows, type AutomationRun } from "../../app/data";
import { ExecutionApprovalInfo, RecordSummary, RollbackInfo } from "../../app/ui-info";
import { executionScope, explicitReference, filterTasks, groupRuns, inventorySummary, latestAutomation, publicLists, referenceMetadata, rollbackScope, ruleOrigins, runGuidance, stateLabel, successfulRetry } from "../../lib/ui-projections";
import { fixtureEmployees, defaultMasterData } from "../ui/fixtures";

test("requested inventory stays unconfirmed even when all tasks and the process are complete", () => {
  const person = fixtureEmployees[2];
  assert.equal(person.status, "completed");
  assert.ok(person.tasks.every((task) => task.status === "done"));
  assert.match(inventorySummary(referenceMetadata(person).services), /0 von .*nicht bestätigt/);
  const html = renderToStaticMarkup(createElement(RecordSummary, { person }));
  for (const label of ["Vorgangsstatus", "Aufgabenfortschritt", "Dokumentierter Bestandsstatus", "Letzter Automationslauf", "Fehlgeschlagen", "Beantragt"]) assert.ok(html.includes(label), label);
  assert.match(inventorySummary([]), /nicht bestätigt/);
  assert.equal(stateLabel("future-unknown"), "Nicht bestätigt");
});
test("task filters default-open semantics include ready, retain done and allow all", () => {
  const tasks = [{ status: "open" as const }, { status: "ready" as const }, { status: "done" as const }];
  assert.deepEqual(filterTasks(tasks, "open"), tasks.slice(0,2));
  assert.deepEqual(filterTasks(tasks, "done"), [tasks[2]]);
  assert.deepEqual(filterTasks(tasks, "all"), tasks);
  assert.deepEqual(filterTasks([], "open"), []);
});
test("only explicit reference metadata and exactly matching generated tasks are reclassified; raw history remains", () => {
  const base = structuredClone(fixtureEmployees[0]);
  base.services.push({ id: "legacy-reference", key: "ref", label: "Oder wie MA: Test Referenz", category: "Anwendung", status: "requested", source: "legacy.csv" });
  base.tasks.push({ id: "legacy-task", title: "Oder wie MA: Test Referenz bereitstellen", eventType: "onboarding", owner: "IT", executionType: "simulated", status: "done" });
  base.tasks.push({ id: "legit-task", title: "Berechtigungen wie bisher prüfen", eventType: "change", owner: "IT", executionType: "manual", status: "open" });
  const snapshot = structuredClone(base);
  const projection = referenceMetadata(base);
  assert.ok(!projection.services.some((item) => item.id === "legacy-reference"));
  assert.ok(!projection.tasks.some((item) => item.id === "legacy-task"));
  assert.ok(projection.tasks.some((item) => item.id === "legit-task"));
  assert.deepEqual(base, snapshot);
  for (const label of ["Software wie bisher", "Anwendung: wie MA: Test Referenz", "Berechtigungen wie Mitarbeiter Portal"]) assert.equal(explicitReference(label), "");
  const imported = parseRows([["Laufkarte Eintritt"], ["Vorname", "Test"], ["Name", "Import"], ["Personalnummer", "UI-IMPORT"], ["IT", "X", "Oder wie MA: Test Referenz"]], "synthetic.csv");
  assert.equal(imported.directoryReferenceUser, "Test Referenz");
  assert.equal(imported.services[0].category, "Referenz");
  assert.equal(imported.tasks.length, 0);
});
test("approval names actual employee, target, systems and action count; absent M365 never invented", () => {
  const job = buildAutomationJob(fixtureEmployees[0]);
  const html = renderToStaticMarkup(createElement(ExecutionApprovalInfo, { job }));
  for (const value of ["Test Fall 1", job.directory.userPrincipalName, "Active Directory", "Microsoft 365", "HelpDesk", `${job.actions.length} Aktionen`, "keinen automatischen Rücknahmeweg"]) assert.ok(html.includes(value), value);
  const helpdeskOnly = { ...job, actions: job.actions.filter((action) => action.type === "CreateHelpdeskTicket") };
  assert.deepEqual(executionScope(helpdeskOnly).systems, ["HelpDesk"]);
  assert.equal(executionScope(helpdeskOnly).count, 1);
});
test("rollback partitions only completed supported changes, keeps unsupported effects and excludes prior authenticated rollback", () => {
  const person = fixtureEmployees[1];
  const run = structuredClone(person.automationRuns![0]);
  const scope = rollbackScope(run);
  assert.equal(scope.reversible.length, 1);
  assert.equal(scope.remaining.length, 1);
  assert.equal(scope.unsupported.length, 2);
  const html = renderToStaticMarkup(createElement(RollbackInfo, { run, person }));
  for (const value of ["Wird zurückgenommen", "Bleibt bestehen / manuell zu bearbeiten", "Microsoft 365", "HelpDesk", "Test Fall 2", "GUID"]) assert.ok(html.includes(value), value);
  run.alreadyReversedChangeIds = [run.changes[0].id];
  assert.equal(rollbackScope(run).reversible.length, 0);
  assert.equal(rollbackScope(run).alreadyReversed.length, 1);
  run.changes[0].status = "simulated"; run.alreadyReversedChangeIds = [];
  assert.equal(rollbackScope(run).reversible.length, 0);
  run.actionResults = [{ action: "CreateHelpdeskTicket", status: "failed" }, { action: "ProvisionM365Mailbox", status: "skipped" }];
  assert.ok(rollbackScope(run).unsupported.every((item) => !item.label.includes("bleibt bestehen")));
  assert.ok(rollbackScope(run).unsupported.some((item) => item.label.includes("nicht bestätigt")));
});
test("historic failures are resolved only by explicitly related successful Execute action, never WhatIf or unrelated success", () => {
  const [retry, original] = fixtureEmployees[4].automationRuns!;
  assert.match(runGuidance(original, [original]), /ohne erfolgreiche/);
  assert.match(runGuidance(original, [original, retry]), /zugeordnete echte Wiederholung erfolgreich/);
  assert.equal(successfulRetry([{ ...retry, mode: "WhatIf" }], original, "CreateHelpdeskTicket"), undefined);
  assert.equal(successfulRetry([{ ...retry, relatedRunId: "other" }], original, "CreateHelpdeskTicket"), undefined);
  assert.equal(successfulRetry([{ ...retry, operation: "rollback" }], original, "CreateHelpdeskTicket"), undefined);
  assert.match(runGuidance({ ...original, actionResults: [] }, []), /Behebung .*nicht belegt/);
  assert.match(runGuidance(fixtureEmployees[5].automationRuns![0], []), /Wiederholung gesperrt/);
});
test("run grouping follows relationship IDs including chains, preserves orphans and tolerates cycles", () => {
  const [retry, original] = fixtureEmployees[4].automationRuns!;
  const later = { ...retry, id: "later", relatedRunId: retry.id };
  const groups = groupRuns([later, retry, original]);
  assert.equal(groups.length, 1); assert.equal(groups[0].root.id, original.id);
  assert.equal(groups[0].related.length, 2);
  const orphan = { ...retry, id: "orphan", relatedRunId: "missing" };
  assert.equal(groupRuns([orphan])[0].root.id, "orphan");
  assert.ok(groupRuns([{ ...original, relatedRunId: retry.id }, retry]).length > 0);
  const reference = { ...retry, id: "ref", operation: "reference_check" } as AutomationRun;
  assert.equal(latestAutomation([reference, original])?.id, original.id);
});
test("rule origins link only evidenced rule matches and clearly state when provenance is missing", () => {
  const job = buildAutomationJob(fixtureEmployees[0]);
  assert.equal(ruleOrigins({ type: "CreateAdUser", target: "" }, job, defaultMasterData)[0].href, "/stammdaten?register=task");
  assert.match(ruleOrigins({ type: "UnknownAction", target: "" }, job, [])[0].label, /keine konkrete Stammdatenregel/);
  assert.ok(ruleOrigins({ type: "AddGroup:TEST-GROUP", target: "" }, job, [{ id: "test", kind: "group", label: "Testregel", value: "TEST-GROUP", active: true, owner: "IT" }])[0].label.includes("Testregel"));
});
test("public API projection omits reference names, source documents, history and technical fields including embedded known names", () => {
  const person = structuredClone(fixtureEmployees[0]);
  person.tasks.push({ id: "access", eventType: "onboarding", title: "Zutrittsrechte wie Test Referenz prüfen", owner: "IT", executionType: "manual", status: "open" });
  const lists = publicLists(person);
  const json = JSON.stringify(lists);
  assert.equal(lists.referenceProfile, true);
  assert.ok(!json.includes("Test Referenz"));
  assert.ok(!json.includes("synthetisch-"));
  assert.ok(!json.includes("directoryReferenceUser"));
  assert.ok(lists.tasks.some((task) => task.title === "Zutrittsrechte wie Referenzprofil prüfen"));
  assert.equal(lists.services.length, person.services.length - 1);
});
