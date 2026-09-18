export type LifecycleType = "onboarding" | "change" | "offboarding";
export type ItemStatus = "requested" | "approved" | "active" | "remove" | "removed";

export type ServiceItem = { id: string; key: string; label: string; category: string; status: ItemStatus; source: string; details?: string };
export type TaskItem = { id: string; eventType: LifecycleType; title: string; owner: string; executionType: "manual" | "simulated"; status: "open" | "ready" | "done"; dueDate?: string | null; completedAt?: string | null };
export type LifecycleEvent = { id: string; type: LifecycleType; status: string; sourceFilename: string; importedAt: string };
export type AutomationChange = { id: string; action: string; resourceType: string; resourceId: string; relation: string; beforeValue?: string | null; afterValue?: string | null; rollbackAction: string; status: string };
export type AutomationRun = { id: string; jobId: string; operation: "execute" | "rollback"; mode: "WhatIf" | "Execute"; status: string; relatedRunId?: string | null; canRollback: boolean; startedAt: string; completedAt?: string | null; error?: string; changes: AutomationChange[] };
export type EmployeeRecord = {
  id: string; personnelNumber: string; firstName: string; lastName: string; company: string; department: string;
  jobTitle: string; status: "pending" | "active" | "leaving" | "inactive" | "completed"; startDate?: string | null; endDate?: string | null;
  directoryTargetOu?: string;
  services: ServiceItem[]; tasks: TaskItem[]; events: LifecycleEvent[]; automationRuns?: AutomationRun[];
};

export type MasterDataKind = "group" | "application" | "task" | "ou";
export type MasterDataItem = { id: string; kind: MasterDataKind; label: string; value: string; owner: string; active: boolean };

export const defaultMasterData: MasterDataItem[] = [
  { id: "group-habel", kind: "group", label: "Habel", value: "Habel-User", owner: "IT", active: true },
  { id: "group-caq", kind: "group", label: "CAQ", value: "CAQ-User", owner: "IT", active: true },
  { id: "group-infor", kind: "group", label: "Infor LN", value: "InforLN_UserPRD", owner: "IT", active: true },
  { id: "group-vpn", kind: "group", label: "VPN Mitarbeiter", value: "VPNUser_Mitarbeiter_GG", owner: "IT", active: true },
  { id: "group-internet", kind: "group", label: "Internet eingeschränkt", value: "WG_InternetAccess_Restricted_GG", owner: "IT", active: true },
  { id: "app-office", kind: "application", label: "Microsoft Office", value: "Microsoft Office", owner: "IT", active: true },
  { id: "app-mail", kind: "application", label: "E-Mail-Adresse", value: "E-Mail Adresse", owner: "IT", active: true },
  { id: "app-habel", kind: "application", label: "Habel", value: "Habel", owner: "CO / IT", active: true },
  { id: "task-notebook", kind: "task", label: "Notebook bereitstellen", value: "manual", owner: "IT", active: true },
  { id: "task-account", kind: "task", label: "Benutzerkonto anlegen", value: "agent", owner: "IT", active: true },
  { id: "ou-disabled", kind: "ou", label: "Deaktivierte Benutzer", value: "OU=deaktivierte User,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-pk-notebook", kind: "ou", label: "Denkingen · Notebook", value: "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Denkingen,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-pk-workstation", kind: "ou", label: "Denkingen · Workstation", value: "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Denkingen,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-kf-notebook", kind: "ou", label: "Finnentrop · Notebook", value: "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Finnentrop,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-kf-workstation", kind: "ou", label: "Finnentrop · Workstation", value: "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Finnentrop,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-ma-notebook", kind: "ou", label: "Solingen · Notebook", value: "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Solingen,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-ma-workstation", kind: "ou", label: "Solingen · Workstation", value: "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Solingen,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-su-notebook", kind: "ou", label: "Sulzen · Notebook", value: "OU=Notebook,OU=Client,OU=Ressourcen,OU=Sulzen,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-su-workstation", kind: "ou", label: "Sulzen · Workstation", value: "OU=Workstation,OU=Client,OU=Ressourcen,OU=Sulzen,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-kw-notebook", kind: "ou", label: "Frittlingen · Notebook", value: "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Frittlingen,DC=kauth,DC=local", owner: "IT", active: true },
  { id: "ou-kw-workstation", kind: "ou", label: "Frittlingen · Workstation", value: "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Frittlingen,DC=kauth,DC=local", owner: "IT", active: true },
];

export type AutomationJob = {
  schemaVersion: 1;
  jobId: string;
  createdAt: string;
  operation: "execute";
  requestedMode: "WhatIf" | "Execute";
  lifecycleType: LifecycleType;
  person: { employeeId: string; personnelNumber: string; firstName: string; lastName: string; displayName: string; department: string; jobTitle: string; company: string; startDate?: string | null; endDate?: string | null };
  directory: { domain: "kauth.local"; samAccountName: string; userPrincipalName: string; mail: string; description: string; title: string; targetOu: string; disabledOu: "OU=deaktivierte User,DC=kauth,DC=local"; suggestedGroups: string[]; referenceUser: { displayName: string; givenNameInitial: string; surname: string } | null; computers: Array<{ type: "Notebook" | "Workstation"; prefix: string; targetOu: string; description: string }> };
  helpdesk: { baseUrl: "http://pk-srvhlpdsk001:8002"; subject: string; text: string };
  automationTaskIds: string[];
  actions: Array<{ type: string; target: string; requiresApproval: true }>;
};

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const demoEmployees: EmployeeRecord[] = [
  {
    id: "emp-1022", personnelNumber: "1022", firstName: "Chiara", lastName: "Luger", company: "Paul Kauth GmbH & Co. KG - 78588 Denkingen",
    department: "913610 Personalwesen", jobTitle: "Personal-Referentin", status: "pending", startDate: "2026-10-01",
    services: ["Notebook", "Internetzugang", "Microsoft Office", "E-Mail-Adresse", "Oder wie MA: L. Romankewicz", "Habel"].map((label, index) => ({ id: `svc-c-${index}`, key: label.toLowerCase().replaceAll(" ", "-"), label, category: index === 0 ? "Gerät" : "Anwendung", status: index < 4 ? "approved" : "requested", source: "Eintritt Laufkarte", details: label === "Habel" ? "Ausnahme: Verantwortlichkeit CO, für IT trotzdem relevant" : "" })),
    tasks: [
      { id: "task-c-1", eventType: "onboarding", title: "Benutzerkonto anlegen", owner: "IT", executionType: "simulated", status: "ready", dueDate: "2026-09-25" },
      { id: "task-c-2", eventType: "onboarding", title: "Notebook vorbereiten und Inventarnummer erfassen", owner: "IT", executionType: "manual", status: "open", dueDate: "2026-09-28" },
      { id: "task-c-3", eventType: "onboarding", title: "Zutrittsrechte wie L. Romankewicz prüfen", owner: "IT / HR", executionType: "manual", status: "open", dueDate: "2026-09-28" },
    ],
    events: [{ id: "evt-c-1", type: "onboarding", status: "in_review", sourceFilename: "Eintritt Laufkarte Frau Chiara Luger ab 01.10.2026 Fachbereich HR.xlsx", importedAt: "2026-09-18T08:00:00Z" }],
  },
  {
    id: "emp-1524", personnelNumber: "1524", firstName: "Mert", lastName: "Yelmen", company: "Paul Kauth GmbH & Co. KG",
    department: "Montage Werk 2", jobTitle: "Einrichter", status: "leaving", startDate: "2021-09-01", endDate: "2026-08-31",
    services: ["Telefonbucheintrag", "E-Mail & Verteiler", "Mobile IT-Geräte", "Gewatec", "Infor LN", "CAQ-System", "Habel"].map((label, index) => ({ id: `svc-m-${index}`, key: label.toLowerCase().replaceAll(" ", "-"), label, category: index === 2 ? "Gerät" : "Anwendung", status: index === 3 || index === 4 ? "removed" : "remove", source: "Austritt Laufkarte" })),
    tasks: [
      { id: "task-m-1", eventType: "offboarding", title: "Gewatec Account löschen", owner: "IT", executionType: "simulated", status: "done", completedAt: "2026-08-28" },
      { id: "task-m-2", eventType: "offboarding", title: "E-Mail-Weiterleitung und Abwesenheitsnotiz einrichten", owner: "IT", executionType: "simulated", status: "ready", dueDate: "2026-08-31" },
      { id: "task-m-3", eventType: "offboarding", title: "Mobile Geräte zurücknehmen", owner: "IT", executionType: "manual", status: "open", dueDate: "2026-08-31" },
    ],
    events: [{ id: "evt-m-1", type: "offboarding", status: "in_progress", sourceFilename: "Offboarding Mert Yelmen.xlsx", importedAt: "2026-09-17T14:10:00Z" }],
  },
];

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function isoDate(value: string) {
  const german = value.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/);
  if (german) { const year = german[3].length === 2 ? `20${german[3]}` : german[3]; return `${year}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`; }
  const slash = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) { const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]; return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`; }
  return value.slice(0, 10) || null;
}
function keyOf(label: string) { return label.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/(^-|-$)/g, ""); }

function accountPart(value: string) {
  return value.toLowerCase().trim().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.-]/g, "");
}

export function buildAutomationJob(person: EmployeeRecord): AutomationJob {
  const lifecycleType = person.events[0]?.type ?? "change";
  const samAccountName = `${accountPart(person.firstName)}.${accountPart(person.lastName)}`;
  const serviceText = person.services.map((service) => service.label.toLowerCase()).join(" ");
  const suggestedGroups = new Set<string>();
  if (serviceText.includes("habel")) suggestedGroups.add("Habel-User");
  if (serviceText.includes("caq")) suggestedGroups.add("CAQ-User");
  if (serviceText.includes("infor")) suggestedGroups.add("InforLN_UserPRD");
  if (serviceText.includes("vpn")) suggestedGroups.add("VPNUser_Mitarbeiter_GG");
  if (serviceText.includes("internet")) suggestedGroups.add("WG_InternetAccess_Restricted_GG");
  if (`${person.department} ${person.company}`.toLowerCase().includes("denkingen")) {
    suggestedGroups.add("Denkingen_Alle_Benutzer_GG");
    suggestedGroups.add("Denkingen_MailSignatur_KauthDenkingen_GG");
  }
  const referenceLabel = person.services.find((service) => /\bwie\b/i.test(service.label))?.label ?? "";
  const referenceMatch = referenceLabel.match(/\bwie\b\s*(?:MA\s*:\s*)?(.+)/i);
  const referenceName = referenceMatch?.[1]?.trim() ?? "";
  const referenceParts = referenceName.split(/\s+/).filter(Boolean);
  const referenceUser = referenceParts.length >= 2 ? { displayName: referenceName, givenNameInitial: referenceParts[0].replace(/\.$/, "").slice(0, 1).toUpperCase(), surname: referenceParts.at(-1) ?? "" } : null;
  const locationText = `${person.company} ${person.department}`.toLowerCase();
  const locations = [
    { name: "Denkingen", token: "denkingen", code: "PK", base: "OU=Clients,OU=_Ressourcen,OU=Denkingen,DC=kauth,DC=local" },
    { name: "Finnentrop", token: "finnentrop", code: "KF", base: "OU=Clients,OU=_Ressourcen,OU=Finnentrop,DC=kauth,DC=local" },
    { name: "Solingen", token: "solingen", code: "MA", base: "OU=Clients,OU=_Ressourcen,OU=Solingen,DC=kauth,DC=local" },
    { name: "Sulzen", token: "sulzen", code: "SU", base: "OU=Client,OU=Ressourcen,OU=Sulzen,DC=kauth,DC=local" },
    { name: "Frittlingen", token: "frittlingen", code: "KW", base: "OU=Clients,OU=_Ressourcen,OU=Frittlingen,DC=kauth,DC=local" },
  ];
  const location = locations.find((item) => locationText.includes(item.token));
  const computerDescription = `${person.department || "Keine Abteilung"} / ${person.firstName} ${person.lastName}`;
  const computers: AutomationJob["directory"]["computers"] = [];
  if (lifecycleType === "onboarding" && person.services.some((service) => /notebook|laptop/i.test(service.label))) computers.push({ type: "Notebook", prefix: location ? `${location.code}-CLNB` : "REVIEW_REQUIRED", targetOu: location ? `OU=Notebook,${location.base}` : "REVIEW_REQUIRED", description: computerDescription });
  if (lifecycleType === "onboarding" && person.services.some((service) => /fester rechner|workstation|desktop/i.test(service.label))) computers.push({ type: "Workstation", prefix: location ? `${location.code}-CLWS` : "REVIEW_REQUIRED", targetOu: location ? `OU=Workstation,${location.base}` : "REVIEW_REQUIRED", description: computerDescription });
  const targetOu = lifecycleType === "offboarding" ? "OU=deaktivierte User,DC=kauth,DC=local" : person.directoryTargetOu?.trim() || (referenceUser ? "REFERENCE_USER_OU" : "REVIEW_REQUIRED");
  const actions = lifecycleType === "offboarding"
    ? ["SnapshotAdAccount", "DisableAdUser", "RemoveGroupMemberships", "MoveAdUser", "CreateHelpdeskTicket"]
    : ["CreateAdUser", ...(referenceUser ? ["CopyGroupsFromReference"] : []), ...Array.from(suggestedGroups, (group) => `AddGroup:${group}`), ...computers.map((computer) => `CreateAdComputer:${computer.type}`), "CreateHelpdeskTicket"];
  const subject = `${lifecycleType === "offboarding" ? "Offboarding" : lifecycleType === "onboarding" ? "Onboarding" : "Wechsel"}: ${person.firstName} ${person.lastName}`;

  return {
    schemaVersion: 1,
    operation: "execute",
    jobId: `lifecycle-${person.personnelNumber}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    requestedMode: "WhatIf",
    lifecycleType,
    person: { employeeId: person.id, personnelNumber: person.personnelNumber, firstName: person.firstName, lastName: person.lastName, displayName: `${person.firstName} ${person.lastName}`, department: person.department, jobTitle: person.jobTitle, company: person.company, startDate: person.startDate, endDate: person.endDate },
    directory: { domain: "kauth.local", samAccountName, userPrincipalName: `${samAccountName}@kauth.de`, mail: `${samAccountName}@kauth.de`, description: person.jobTitle, title: person.jobTitle, targetOu, disabledOu: "OU=deaktivierte User,DC=kauth,DC=local", suggestedGroups: Array.from(suggestedGroups), referenceUser, computers },
    helpdesk: { baseUrl: "http://pk-srvhlpdsk001:8002", subject, text: `${subject}\nPersonalnummer: ${person.personnelNumber}\nAbteilung: ${person.department || "nicht angegeben"}\nTermin: ${lifecycleType === "offboarding" ? person.endDate ?? "offen" : person.startDate ?? "offen"}\nQuelle: ${person.events[0]?.sourceFilename ?? "Lifecycle-Portal"}` },
    automationTaskIds: person.tasks.filter((task) => task.executionType === "simulated" && task.status !== "done").map((task) => task.id),
    actions: actions.map((type) => ({ type, target: type.startsWith("AddGroup:") ? type.slice(9) : type.startsWith("CreateAdComputer:") ? computers.find((computer) => type.endsWith(computer.type))?.prefix + "xxx" : type === "CopyGroupsFromReference" ? referenceUser?.displayName ?? "Referenzbenutzer" : samAccountName, requiresApproval: true })),
  };
}

export function parseRows(rows: unknown[][], filename: string): EmployeeRecord {
  const normalized = rows.map((row) => row.map(clean));
  const lookup = (label: string) => normalized.find((row) => row[0]?.toLowerCase().startsWith(label.toLowerCase()))?.[1] ?? "";
  const documentTitle = normalized.find((row) => row.some((cell) => /laufkarte\s+(eintritt|austritt)/i.test(cell)))?.join(" ").toLowerCase() ?? filename.toLowerCase();
  const type: LifecycleType = /laufkarte\s+austritt|offboarding/.test(documentTitle) ? "offboarding" : "onboarding";
  const firstName = lookup("Vorname");
  const lastName = lookup("Name");
  const personnelNumber = lookup("Personal Nummer") || lookup("Personalnummer");
  if (!firstName || !lastName) throw new Error("Vorname oder Nachname konnte nicht erkannt werden.");
  if (!personnelNumber) throw new Error("Die Personalnummer konnte nicht erkannt werden.");
  const services: ServiceItem[] = [];
  const tasks: TaskItem[] = [];

  if (type === "onboarding") {
    normalized.forEach((row) => {
      const selected = row[1]?.toUpperCase() === "X";
      const owner = row[0]?.toLowerCase() ?? "";
      const label = row[2] ?? "";
      const belongsToIt = /^it(?:\s|:|$)/i.test(owner) || /^habel$/i.test(label);
      if (selected && belongsToIt && label && !/^(JA|NEIN)$/i.test(label)) {
        services.push({ id: uid("svc"), key: keyOf(label), label, category: /notebook|rechner|telefon|handy|kleidung/i.test(label) ? "Gerät" : "Anwendung", status: "requested", source: filename });
      }
    });
    services.forEach((service) => {
      const executionType = /konto|mail|zugang|internet|vpn|wie\s+(?:ma\s*:\s*)?/i.test(service.label) ? "simulated" : "manual";
      tasks.push({ id: uid("task"), eventType: type, title: `${service.label} bereitstellen`, owner: "IT", executionType, status: executionType === "simulated" ? "ready" : "open" });
    });
  } else {
    normalized.forEach((row) => {
      const owner = row[4]?.toLowerCase() ?? "";
      const belongsToIt = /(^|\W)it(\W|$)/i.test(owner) || /habel/i.test(row[0] ?? "");
      if (row[0] && row[4] && belongsToIt && !/beschreibung|verantwortlicher/i.test(row[0])) {
        const done = row[6]?.toLowerCase() === "x";
        const executionType = /benutzerkonto|active directory|ad-benutzer|it-zugänge.*deaktiviert|netzwerkzugang/i.test(row[0]) && /(^|\W)it(\W|$)/i.test(owner) ? "simulated" : "manual";
        tasks.push({ id: uid("task"), eventType: type, title: row[0], owner: row[4], executionType, status: done ? "done" : executionType === "simulated" ? "ready" : "open", completedAt: done ? isoDate(row[8] || "") : null });
        if (/account|zugang|mail|system|gerät|telefon/i.test(row[0])) services.push({ id: uid("svc"), key: keyOf(row[0]), label: row[0], category: /gerät|telefon/i.test(row[0]) ? "Gerät" : "Anwendung", status: done ? "removed" : "remove", source: filename });
      }
    });
  }

  return {
    id: `emp-${personnelNumber}`, personnelNumber, firstName, lastName, company: lookup("Unternehmen"),
    department: lookup("Abteilung Name") || lookup("Abteilung"), jobTitle: lookup("Stellenbezeichnung") || lookup("Position") || lookup("Tätigkeit"),
    status: type === "offboarding" ? "leaving" : "pending", startDate: isoDate(lookup("Eintritt")),
    endDate: type === "offboarding" ? isoDate(lookup("Austritt") || lookup("Letzter Arbeitstag")) : null,
    services, tasks,
    events: [{ id: uid("evt"), type, status: "in_review", sourceFilename: filename, importedAt: new Date().toISOString() }],
  };
}

export function buildPowerShellPreview(person: EmployeeRecord) {
  const job = buildAutomationJob(person);
  const q = (value: string) => value.replace(/'/g, "''");
  const ticketText = job.helpdesk.text.replace(/'@/g, "' + '@");
  const ticketBlock = `
# i-net-HelpDesk-Ticket erstellen. Im WhatIf-Modus wird nur der Inhalt gezeigt.
$TicketText = @'
${ticketText}
'@
if ($WhatIfMode) {
    Write-Host "WHATIF: HelpDesk-Ticket '${q(job.helpdesk.subject)}'"
    Write-Host $TicketText
} elseif ($PSCmdlet.ShouldProcess('${q(job.helpdesk.baseUrl)}', 'HelpDesk-Ticket erstellen')) {
    $HelpdeskCredential = Get-Credential -Message 'i-net-HelpDesk-API-Konto eingeben'
    $PlainPassword = $HelpdeskCredential.GetNetworkCredential().Password
    try {
        $BasicBytes = [Text.Encoding]::ASCII.GetBytes("$($HelpdeskCredential.UserName):$PlainPassword")
        $Headers = @{ Authorization = "Basic $([Convert]::ToBase64String($BasicBytes))" }
        $Body = @{ text = $TicketText; htmlContent = $false; ticketFields = @{ subject = '${q(job.helpdesk.subject)}' }; actionArguments = @{} } | ConvertTo-Json -Depth 8
        Invoke-RestMethod -Uri '${q(job.helpdesk.baseUrl)}/api/ticket/create' -Method Post -Headers $Headers -ContentType 'application/json; charset=utf-8' -Body $Body
    } finally {
        $PlainPassword = $null; $BasicBytes = $null; $Headers = $null
    }
}`;

  if (job.lifecycleType === "offboarding") {
    return `[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param([ValidateSet('WhatIf','Execute')][string]$Mode = 'WhatIf')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$WhatIfMode = $Mode -eq 'WhatIf'
Import-Module ActiveDirectory
$Credential = Get-Credential -Message 'Delegiertes AD-Konto eingeben'
$AdConnection = @{ Server = '${q(job.directory.domain)}'; Credential = $Credential; ErrorAction = 'Stop' }
$User = Get-ADUser -Identity '${q(job.directory.samAccountName)}' -Properties MemberOf,Enabled,DistinguishedName @AdConnection

# Aktuellen Zustand vor der Änderung sichtbar sichern.
$User | Select-Object SamAccountName,Enabled,DistinguishedName,MemberOf | ConvertTo-Json -Depth 5

# Direkte Gruppenmitgliedschaften entfernen, Benutzer deaktivieren und verschieben.
foreach ($GroupDn in @($User.MemberOf)) {
    Remove-ADGroupMember -Identity $GroupDn -Members $User -Confirm:$false @AdConnection -WhatIf:$WhatIfMode
}
Disable-ADAccount -Identity $User @AdConnection -WhatIf:$WhatIfMode
Move-ADObject -Identity $User.DistinguishedName -TargetPath '${q(job.directory.disabledOu)}' @AdConnection -WhatIf:$WhatIfMode
${ticketBlock}

Write-Host 'Offboarding-Skript abgeschlossen.'`;
  }
  const groupLines = job.directory.suggestedGroups.map((group) => `Add-ADGroupMember -Identity '${q(group)}' -Members $SamAccountName @AdConnection -WhatIf:$WhatIfMode`).join("\n");
  const referenceLookup = job.directory.referenceUser ? `
# Referenzbenutzer eindeutig auflösen. Dessen OU und direkte Gruppen werden übernommen.
$ReferenceUsers = @(Get-ADUser -Filter "Surname -eq '${q(job.directory.referenceUser.surname)}' -and GivenName -like '${q(job.directory.referenceUser.givenNameInitial)}*'" -Properties MemberOf,DistinguishedName @AdConnection)
if ($ReferenceUsers.Count -ne 1) { throw 'Referenzbenutzer ist nicht eindeutig.' }
$ReferenceUser = $ReferenceUsers[0]
$TargetOu = $ReferenceUser.DistinguishedName -replace '^CN=(?:\\.|[^,])+,', ''` : `
$ReferenceUser = $null
$TargetOu = '${q(job.directory.targetOu)}'`;
  const referenceLines = job.directory.referenceUser ? `
# Alle direkten AD-Gruppen des Referenzbenutzers kopieren.
foreach ($GroupDn in @($ReferenceUser.MemberOf)) {
    Add-ADGroupMember -Identity $GroupDn -Members $SamAccountName @AdConnection -WhatIf:$WhatIfMode
}` : "# Kein Referenzbenutzer angegeben.";
  const computerLines = job.directory.computers.map((computer) => `
New-NextAdComputer -Prefix '${q(computer.prefix)}' -TargetOu '${q(computer.targetOu)}' -Description '${q(computer.description)}' -ManagedBy $(if ($User) { $User.DistinguishedName } else { $null })`).join("\n");
  return `[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param([ValidateSet('WhatIf','Execute')][string]$Mode = 'WhatIf')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$WhatIfMode = $Mode -eq 'WhatIf'
Import-Module ActiveDirectory

# Zugangsdaten werden nur auf PK-SRVMGMT002 abgefragt und nicht gespeichert.
$Credential = Get-Credential -Message 'Delegiertes AD-Konto eingeben'
$AdConnection = @{ Server = '${q(job.directory.domain)}'; Credential = $Credential; ErrorAction = 'Stop' }
$SamAccountName = '${q(job.directory.samAccountName)}'

function New-NextAdComputer {
    param([string]$Prefix, [string]$TargetOu, [string]$Description, [AllowNull()][string]$ManagedBy)
    if ($Prefix -eq 'REVIEW_REQUIRED' -or $TargetOu -eq 'REVIEW_REQUIRED') { throw 'Standort oder Computer-OU muss geprüft werden.' }
    $Numbers = Get-ADComputer -Filter "Name -like '$Prefix*'" @AdConnection | ForEach-Object {
        if ($_.Name -match '^' + [regex]::Escape($Prefix) + '(\\d+)$') { [int]$Matches[1] }
    }
    $NextNumber = if ($Numbers) { ($Numbers | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    do {
        $ComputerName = $Prefix + $NextNumber.ToString('000')
        $Exists = Get-ADComputer -Filter "Name -eq '$ComputerName'" @AdConnection
        if ($Exists) { $NextNumber++ }
    } while ($Exists)
    $ComputerArgs = @{ Name = $ComputerName; SamAccountName = ($ComputerName + '$'); Path = $TargetOu; Description = $Description; Enabled = $true }
    if ($ManagedBy) { $ComputerArgs.ManagedBy = $ManagedBy }
    New-ADComputer @ComputerArgs @AdConnection -WhatIf:$WhatIfMode
}

${referenceLookup}

# Benutzer mit Stellenbezeichnung in Beschreibung und Position anlegen.
$User = Get-ADUser -Filter "SamAccountName -eq '$SamAccountName'" @AdConnection
if (-not $User) {
    New-ADUser -Name '${q(job.person.displayName)}' -GivenName '${q(job.person.firstName)}' -Surname '${q(job.person.lastName)}' -DisplayName '${q(job.person.displayName)}' -SamAccountName $SamAccountName -UserPrincipalName '${q(job.directory.userPrincipalName)}' -EmailAddress '${q(job.directory.mail)}' -EmployeeNumber '${q(job.person.personnelNumber)}' -Department '${q(job.person.department)}' -Company '${q(job.person.company)}' -Description '${q(job.directory.description)}' -Title '${q(job.directory.title)}' -Path $TargetOu -Enabled $false @AdConnection -WhatIf:$WhatIfMode
    if (-not $WhatIfMode) { $User = Get-ADUser -Identity $SamAccountName @AdConnection }
}
${referenceLines}

# Zusätzlich aus der Laufkarte abgeleitete Gruppen sicherstellen.
${groupLines || "# Keine zusätzlichen Gruppen abgeleitet."}

# Computerobjekte mit nächster freier Nummer und Beschreibung „Abteilung / Name“ anlegen.
${computerLines || "# Kein Notebook und keine Workstation angefordert."}

${ticketBlock}

Write-Host 'Onboarding-Skript abgeschlossen. Im Execute-Modus wird jede Änderung bestätigt.'`;
}
