import type { AutomationJob, AutomationRun, EmployeeRecord } from "./data";
import { executionScope, inventorySummary, latestAutomation, referenceMetadata, rollbackScope, runGuidance, stateLabel } from "../lib/ui-projections";

export function ExecutionApprovalInfo({ job }: { job: AutomationJob }) {
  const scope = executionScope(job);
  return <div className="space-y-3 text-sm" data-testid="execution-scope">
    <dl className="grid gap-2"><div><dt className="text-muted-foreground">Mitarbeiter</dt><dd className="font-semibold">{scope.person} · #{job.person.personnelNumber}</dd></div><div><dt className="text-muted-foreground">Zielkonto</dt><dd className="break-all">{scope.account}</dd></div><div><dt className="text-muted-foreground">Betroffene Systeme · {scope.count} Aktionen</dt><dd>{scope.systems.join(" · ") || "Keine Aktionen"}</dd></div></dl>
    <p>Rücknahme ist nur für unterstützte, protokollierte Änderungen nach Prüfung des aktuellen Zustands möglich. Microsoft 365 und HelpDesk haben keinen automatischen Rücknahmeweg. Geräteübergabe und weitere manuelle Arbeit bleiben separat.</p>
    <details><summary>Geplante Aktionen anzeigen</summary><ul className="list-disc pl-5">{job.actions.map((action) => <li key={action.type}>{action.type} · {action.target}</li>)}</ul></details>
  </div>;
}
export function RollbackInfo({ run, person }: { run: AutomationRun; person: EmployeeRecord }) {
  const scope = rollbackScope(run);
  return <div className="max-h-[55vh] space-y-4 overflow-y-auto text-sm" data-testid="rollback-scope">
    <p className="font-semibold">Akte: {person.firstName} {person.lastName} · Zielkonto des Laufs: {run.targetAccount || "im Lauf nicht dokumentiert"}</p>
    <section><h3 className="font-semibold">Wird zurückgenommen</h3><p className="mb-2 text-muted-foreground">Nur bei erfolgreicher GUID- und Zustandsprüfung; Konflikte erfordern manuelle Klärung.</p>{scope.reversible.length ? scope.reversible.map(({ change, label, name }) => <div key={change.id} className="mb-2 rounded-lg border p-2"><p>{label}: {name}</p><details><summary>Technische Kennung</summary><p className="break-all">{change.resourceType} · {change.resourceId} · {change.rollbackAction}</p></details></div>) : <p>Keine unterstützte abgeschlossene Änderung protokolliert.</p>}</section>
    <section><h3 className="font-semibold">Bleibt bestehen / manuell zu bearbeiten</h3>{scope.unsupported.map((action) => <p key={action.type}>{action.label} · {action.target || "Ziel im Ergebnis nicht dokumentiert"}. Tatsächliche Wirkung im Zielsystem prüfen.</p>)}{scope.remaining.map((change) => <p key={change.id}>{change.action} · {change.relation || change.resourceType}: {stateLabel(change.status)}; kein bestätigter Rücknahmeweg.</p>)}{!scope.unsupported.length && !scope.remaining.length && <p>Keine weiteren Änderungen im Lauf ausgewiesen. Nicht protokollierte externe und manuelle Arbeit ist nicht Teil der Rücknahme.</p>}</section>
    {scope.alreadyReversed.length > 0 && <section><h3 className="font-semibold">Bereits nachweislich zurückgenommen</h3>{scope.alreadyReversed.map((change) => <p key={change.id}>{change.action} · {change.relation || change.resourceType}</p>)}</section>}
  </div>;
}
export function RecordSummary({ person }: { person: EmployeeRecord }) {
  const projection = referenceMetadata(person);
  const latest = latestAutomation(person.automationRuns ?? []);
  return <section className="rounded-xl border border-[#dce3e7] bg-[#f8fafb] p-4 text-sm" aria-label="Vorgang und dokumentierter Stand">
    <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-[#667680]">Vorgangsstatus</dt><dd className="font-medium">{stateLabel(person.status)}</dd></div><div><dt className="text-[#667680]">Aufgabenfortschritt</dt><dd>{projection.tasks.filter((task) => task.status === "done").length} von {projection.tasks.length} erledigt</dd></div><div><dt className="text-[#667680]">Dokumentierter Bestandsstatus</dt><dd>{inventorySummary(projection.services)}</dd></div><div><dt className="text-[#667680]">Letzter Automationslauf</dt><dd>{latest ? `${latest.mode === "WhatIf" ? "Testlauf (WhatIf) · " : latest.operation === "rollback" ? "Rücknahme · " : "Echte Ausführung · "}${stateLabel(latest.status)}` : "Kein Lauf dokumentiert"}</dd></div></dl>
    <p className="mt-3 text-[#667680]">Aufgabenabschluss bestätigt keinen Bestand. Beantragt oder freigegeben bedeutet keine bestätigte Bereitstellung; dies ist der dokumentierte Stand ohne aktuelle Systemabfrage.</p>
  </section>;
}
export function LatestResult({ person }: { person: EmployeeRecord }) {
  const runs = person.automationRuns ?? [];
  const latest = latestAutomation(runs);
  return <section className="rounded-xl border border-[#dce3e7] bg-white p-4" aria-label="Letztes Ergebnis und Handlungsbedarf"><h3 className="font-semibold">Letztes Ergebnis / Handlungsbedarf</h3><p className="mt-2 text-sm font-medium">{latest ? `${latest.mode === "WhatIf" ? "Testlauf (WhatIf)" : latest.operation === "rollback" ? "Rücknahme" : "Echte Ausführung"} · ${stateLabel(latest.status)}` : "Noch kein Ergebnis"}</p><p className="mt-2 text-sm text-[#667680]">{runGuidance(latest, runs)}</p>{latest?.completedAt && <p className="mt-2 text-xs text-[#667680]">Stand: {new Date(latest.completedAt).toLocaleString("de-DE")}</p>}</section>;
}
