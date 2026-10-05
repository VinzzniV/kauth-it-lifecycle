import type { AutomationJob, AutomationRun, EmployeeRecord, MasterDataItem, ServiceItem, TaskItem } from "../app/data";

export const statusText: Record<string, string> = {
  pending: "In Prüfung", active: "Aktiv", leaving: "Austritt läuft", inactive: "Inaktiv",
  completed: "Abgeschlossen", requested: "Beantragt", approved: "Freigegeben",
  remove: "Zu entfernen", removed: "Entfernt", open: "Offen", ready: "Bereit",
  done: "Erledigt", queued: "Wartet", running: "Läuft", partial: "Teilweise erfolgreich",
  failed: "Fehlgeschlagen", review_required: "Prüfung erforderlich", reviewed: "Manuell geprüft",
  rolled_back: "Zurückgenommen", simulated: "Testlauf (WhatIf) abgeschlossen",
  skipped: "Übersprungen", in_review: "In Prüfung", in_progress: "In Bearbeitung",
  found: "Gefunden", not_found: "Nicht gefunden", ambiguous: "Nicht eindeutig",
};
export function stateLabel(status: string) { return statusText[status] ?? "Nicht bestätigt"; }

// Only the explicit reference-field syntax is recognized. Ordinary prose containing
// “wie” is never reclassified; the raw records remain available in the history.
export function explicitReference(label: string) {
  return label.match(/^(?:Oder\s+)?wie\s+(?:MA\s*:\s*|Mitarbeiter\s*:\s*)(\S.*)$/i)?.[1]?.trim() ?? "";
}
export function referenceMetadata(person: Pick<EmployeeRecord, "services" | "tasks" | "directoryReferenceUser">) {
  const references = person.services.filter((service) => explicitReference(service.label));
  const referenceTasks = person.tasks.filter((task) => references.some((service) =>
    task.title === `${service.label} bereitstellen` || task.title === service.label));
  return {
    name: person.directoryReferenceUser?.trim() || (references.length === 1 ? explicitReference(references[0].label) : ""),
    references, referenceTasks,
    services: person.services.filter((service) => !references.includes(service)),
    tasks: person.tasks.filter((task) => !referenceTasks.includes(task)),
  };
}
export type TaskFilter = "open" | "done" | "all";
export function publicLists(person: Pick<EmployeeRecord, "services" | "tasks" | "directoryReferenceUser">) {
  const projection = referenceMetadata(person);
  const names = new Set([projection.name, ...projection.references.map((service) => explicitReference(service.label))].filter(Boolean));
  const redact = (text: string) => { for (const name of names) text = text.replaceAll(name, "Referenzprofil"); return text; };
  return {
    referenceProfile: names.size > 0,
    tasks: projection.tasks.map(({ id, eventType, title, owner, executionType, status, dueDate, completedAt }) => ({ id, eventType, title: redact(title), owner, executionType, status, dueDate, completedAt })),
    services: projection.services.map(({ id, label, category, status }) => ({ id, label: redact(label), category, status })),
  };
}
export function filterTasks<T extends Pick<TaskItem, "status">>(tasks: T[], filter: TaskFilter) {
  return tasks.filter((task) => filter === "all" || (filter === "done" ? task.status === "done" : task.status !== "done"));
}
export function inventorySummary(services: Pick<ServiceItem, "status">[]) {
  const confirmed = services.filter((item) => item.status === "active" || item.status === "removed").length;
  return services.length ? `${confirmed} von ${services.length} Einträgen dokumentiert bestätigt; ${services.length - confirmed} nicht bestätigt` : "Kein Bestand dokumentiert – nicht bestätigt";
}
export function latestAutomation(runs: AutomationRun[]) {
  return [...runs].filter((run) => run.operation !== "reference_check").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}
export function successfulRetry(runs: AutomationRun[], run: AutomationRun, action: string) {
  return runs.find((candidate) => candidate.operation === "execute" && candidate.mode === "Execute" && candidate.relatedRunId === run.id && candidate.actionResults?.some((result) => result.action === action && result.status === "completed"));
}
export function runGuidance(run: AutomationRun | undefined, runs: AutomationRun[]) {
  if (!run) return "Noch kein Automationsergebnis. Der externe Zustand ist nicht bestätigt.";
  if (run.mode === "WhatIf") return "Testlauf (WhatIf): keine Bestätigung einer echten Bereitstellung oder Rücknahme.";
  if (run.status === "review_required" || run.actionResults?.some((item) => item.status === "review_required")) return "Externe Wirkung unklar: Zielsystem und Protokolle manuell prüfen. Automatische Wiederholung gesperrt.";
  const failed = run.actionResults?.filter((item) => item.status === "failed") ?? [];
  if (failed.length) {
    const resolved = failed.filter((item) => successfulRetry(runs, run, item.action)).length;
    return resolved === failed.length ? "Fehlgeschlagene Schritte durch zugeordnete echte Wiederholung erfolgreich abgeschlossen. Ursprünglicher Fehler bleibt dokumentiert." : `${failed.length - resolved} fehlgeschlagene Schritte ohne erfolgreiche zugeordnete Wiederholung. Einzelwiederholung nur bei nachweislich fehlgeschlagener Aktion; vorhandene Sperren gelten weiter.`;
  }
  if (["failed", "partial", "reviewed"].includes(run.status)) return "Ergebnis erfordert Prüfung. Eine Behebung ist aus den vorhandenen Daten nicht belegt; ohne eindeutig fehlgeschlagene Aktion keine Einzelwiederholung.";
  if (run.status === "queued" || run.status === "running") return "Auftrag noch nicht abgeschlossen; Ergebnis abwarten.";
  return "Ergebnis dokumentiert. Aufgabenabschluss und externer Bestand sind getrennt zu prüfen; keine aktuelle Systemabfrage.";
}
export function executionScope(job: Pick<AutomationJob, "person" | "directory" | "actions">) {
  const systems = new Set<string>();
  for (const action of job.actions) {
    if (/^(Create|Update|Snapshot|Disable|Move)Ad|^(CopyGroupsFromReference|RemoveGroupMemberships|AddGroup:|ReuseAdComputer:)/.test(action.type)) systems.add("Active Directory");
    else if (action.type === "ProvisionM365Mailbox") systems.add("Microsoft 365 (Synchronisation, Lizenz und Postfach)");
    else if (action.type === "CreateHelpdeskTicket") systems.add("HelpDesk");
    else systems.add(`Weiteres System: ${action.type}`);
  }
  return { person: `${job.person.firstName} ${job.person.lastName}`, account: `${job.directory.samAccountName} · ${job.directory.userPrincipalName}`, count: job.actions.length, systems: [...systems] };
}
const rollbackLabels: Record<string, string> = {
  "Remove-ADUser": "Neu angelegtes AD-Benutzerkonto entfernen", "Remove-ADComputer": "Neu angelegtes AD-Computerobjekt entfernen",
  "Restore-ADComputerDescription": "Vorherige Computerbeschreibung wiederherstellen", "Enable-ADAccount": "AD-Konto wieder aktivieren",
  "Move-ADObject": "Vorherige OU wiederherstellen", "Remove-ADGroupMember": "Hinzugefügte Gruppenmitgliedschaft entfernen",
  "Add-ADGroupMember": "Entfernte Gruppenmitgliedschaft wiederherstellen", "Restore-ADUserAttributes": "Vorherige Benutzerattribute wiederherstellen",
};
export function rollbackScope(run: AutomationRun) {
  const alreadyReversed = run.changes.filter((change) => run.alreadyReversedChangeIds?.includes(change.id));
  const reversible = run.changes.filter((change) => !alreadyReversed.includes(change) && change.status === "completed" && rollbackLabels[change.rollbackAction]);
  const remaining = run.changes.filter((change) => !reversible.includes(change) && !alreadyReversed.includes(change));
  const unsupported = (run.plannedActions ?? run.actionResults?.map((item) => ({ type: item.action, target: "" })) ?? [])
    .filter((action) => ["ProvisionM365Mailbox", "CreateHelpdeskTicket"].includes(action.type));
  return {
    alreadyReversed,
    reversible: reversible.map((change) => {
      let after: Record<string, unknown> = {};
      try { after = JSON.parse(change.afterValue || "{}"); } catch { /* raw detail remains available */ }
      const name = [after.DisplayName, after.Name, after.SamAccountName, after.UserPrincipalName].find((item) => typeof item === "string" && item);
      return { change, label: rollbackLabels[change.rollbackAction], name: typeof name === "string" ? name : change.relation || change.resourceType };
    }),
    remaining,
    unsupported: unsupported.map((action) => {
      const outcome = run.actionResults?.find((result) => result.action === action.type)?.status;
      const system = action.type === "ProvisionM365Mailbox" ? "Microsoft 365: Synchronisation, Lizenz und Postfach" : "HelpDesk-Ticket";
      const label = outcome === "completed" ? `${system} bleibt bestehen; manuell prüfen/bearbeiten`
        : outcome === "skipped" ? `${system}: laut Ergebnis übersprungen; keine Wirkung bestätigt`
        : `${system}: tatsächliche Wirkung nicht bestätigt; ggf. manuell bearbeiten`;
      return { ...action, label };
    }),
  };
}
export function groupRuns(runs: AutomationRun[]) {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const rootOf = (run: AutomationRun) => {
    const seen = new Set([run.id]);
    while (run.relatedRunId && byId.has(run.relatedRunId) && !seen.has(run.relatedRunId)) {
      seen.add(run.relatedRunId); run = byId.get(run.relatedRunId)!;
    }
    return run.id;
  };
  const groups = new Map<string, AutomationRun[]>();
  for (const run of runs) { const id = rootOf(run); groups.set(id, [...(groups.get(id) ?? []), run]); }
  return [...groups].map(([id, members]) => ({ root: byId.get(id)!, related: members.filter((run) => run.id !== id).sort((a, b) => a.startedAt.localeCompare(b.startedAt)) }));
}
export function ruleOrigins(action: { type: string; target: string }, job: AutomationJob, rules: MasterDataItem[]) {
  const ids = action.type === "CreateAdUser" || action.type === "UpdateAdUser" ? ["task-account"]
    : /AdComputer:Notebook$/.test(action.type) ? ["task-computer-notebook"]
    : /AdComputer:Workstation$/.test(action.type) ? ["task-computer-workstation"]
    : action.type === "ProvisionM365Mailbox" ? ["app-mail"]
    : action.type === "MoveAdUser" && job.lifecycleType === "offboarding" ? ["ou-disabled"] : [];
  const locationText = `${job.person.company} ${job.person.department}`.toLowerCase();
  const location = rules.find((rule) => rule.kind === "location" && rule.active && locationText.includes(rule.label.toLowerCase()));
  const computerType = /AdComputer:/.test(action.type) ? action.type.split(":")[1] : "";
  const ouRules = location && computerType ? rules.filter((rule) => rule.kind === "ou" && (rule.label.toLowerCase() === `${location.label} · ${computerType}`.toLowerCase() || rule.id === `ou-${location.value.toLowerCase()}-${computerType.toLowerCase()}`)) : [];
  const helpdesk = action.type === "CreateHelpdeskTicket" ? rules.filter((rule) => rule.kind === "helpdesk" && rule.active && rule.value.trim()).at(-1) : undefined;
  const matches = rules.filter((rule) => rule.active && (ids.includes(rule.id) || rule === helpdesk || (action.type.startsWith("AddGroup:") && rule.kind === "group" && rule.value === action.type.slice(9)) || (ouRules.length === 1 && rule === ouRules[0] && job.directory.computers.some((computer) => computer.type === computerType && computer.targetOu === rule.value))));
  if (matches.length) return matches.map((rule) => ({ label: `Stammdaten: ${rule.label}`, href: `/stammdaten?register=${rule.kind}` }));
  if (action.type === "CopyGroupsFromReference") return [{ label: "Quelle: Referenzprofil der Akte", href: "/stammdaten?register=group" }];
  return [{ label: "Planungslogik der Anwendung; keine konkrete Stammdatenregel ausgewiesen", href: `/stammdaten?register=${action.type === "CreateHelpdeskTicket" ? "helpdesk" : "application"}` }];
}
