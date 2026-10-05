import { applyMasterData, buildAutomationJob, defaultMasterData, parseRows, type AutomationRun, type EmployeeRecord } from "../../app/data";

function person(id: number, status: EmployeeRecord["status"]): EmployeeRecord {
  const record = applyMasterData(parseRows([["Laufkarte Eintritt"], ["Vorname", "Test"], ["Name", `Fall ${id}`], ["Personalnummer", `UI-TEST-${id}`], ["Unternehmen", "Denkingen"], ["Abteilung", "Testbetrieb"], ["Eintritt", "01.10.2026"], ["IT", "X", "Benutzerkonto"], ["IT", "X", "E-Mail-Adresse"], ["IT", "X", "Notebook"], ["IT", "X", "Oder wie MA: Test Referenz"]], `synthetisch-${id}.csv`), defaultMasterData);
  // Model the legacy audit state as well as new imports, without touching live data.
  const reference = record.services.find((service) => service.category === "Referenz")!;
  reference.category = "Anwendung";
  record.tasks.push({ id: "legacy-reference", eventType: "onboarding", title: `${reference.label} bereitstellen`, owner: "IT", executionType: "simulated", status: "ready" });
  return { ...record, id: `ui-${id}`, status, directoryTargetOu: "OU=Test,DC=example,DC=invalid", directoryReferenceUser: "Test Referenz", directoryReferenceStatus: "found", directoryReferenceMessage: "Synthetischer Referenzdatensatz", shareToken: "a".repeat(31) + id, shareExpiresAt: "2099-01-01T00:00:00Z", tasks: record.tasks.map((task, i) => ({ ...task, id: `ui-${id}-task-${i}`, status: status === "completed" ? "done" : task.status })), services: record.services.map((item, i) => ({ ...item, id: `ui-${id}-service-${i}`, status: id === 2 ? "active" : "requested" })), auditEntries: [{ id, action: "Aufgabe geändert", detail: "Historische Testaufgabe: done", createdAt: "2026-10-01T08:00:00Z" }] };
}
function run(record: EmployeeRecord, id: string, status: string, actions: { action: string; status: string }[], relatedRunId?: string): AutomationRun {
  const job = buildAutomationJob(record);
  return { id, jobId: `job-${id}`, operation: "execute", mode: "Execute", status, startedAt: `2026-10-0${relatedRunId ? 3 : 2}T09:00:00Z`, completedAt: `2026-10-0${relatedRunId ? 3 : 2}T09:01:00Z`, relatedRunId, canRollback: status === "completed", error: status === "failed" || status === "partial" ? "Synthetischer Fehler: Testadapter antwortet nicht." : "", actionResults: actions, targetAccount: job.directory.userPrincipalName, plannedActions: relatedRunId ? [{ type: "CreateHelpdeskTicket", target: "Testticket" }] : job.actions,
    changes: status === "completed" || status === "partial" ? [
      { id: `change-${id}`, action: "AD-Benutzer angelegt", resourceType: "AD-Benutzer", resourceId: "11111111-1111-1111-1111-111111111111", relation: "Testkonto", afterValue: JSON.stringify({ DisplayName: `${record.firstName} ${record.lastName}`, SamAccountName: "test.fall", Description: "Synthetisch", Enabled: true }), rollbackAction: "Remove-ADUser", status: "completed" },
      { id: `m365-${id}`, action: "Microsoft-365-Postfach bereitgestellt", resourceType: "Microsoft 365", resourceId: "test-cloud", relation: "Testlizenz und Testpostfach", rollbackAction: "manual", status: "completed" },
    ] : [] };
}
export const fixtureEmployees = [person(1, "pending"), person(2, "completed"), person(3, "completed"), person(4, "pending"), person(5, "completed"), person(6, "pending")];
fixtureEmployees[1].automationRuns = [run(fixtureEmployees[1], "success", "completed", [{ action: "CreateAdUser", status: "completed" }, { action: "ProvisionM365Mailbox", status: "completed" }, { action: "CreateHelpdeskTicket", status: "completed" }])];
fixtureEmployees[2].automationRuns = [run(fixtureEmployees[2], "failure", "failed", [{ action: "CreateHelpdeskTicket", status: "failed" }])];
fixtureEmployees[3].automationRuns = [run(fixtureEmployees[3], "partial", "partial", [{ action: "CreateAdUser", status: "completed" }, { action: "CreateHelpdeskTicket", status: "failed" }])];
fixtureEmployees[4].automationRuns = [run(fixtureEmployees[4], "retry", "completed", [{ action: "CreateHelpdeskTicket", status: "completed" }], "original"), run(fixtureEmployees[4], "original", "partial", [{ action: "CreateHelpdeskTicket", status: "failed" }])];
fixtureEmployees[5].automationRuns = [run(fixtureEmployees[5], "review", "review_required", [{ action: "CreateAdUser", status: "review_required" }])];
export { defaultMasterData };
