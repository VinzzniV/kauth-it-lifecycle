export type LifecycleType = "onboarding" | "change" | "offboarding";
export type ItemStatus = "requested" | "approved" | "active" | "remove" | "removed";

export type ServiceItem = { id: string; key: string; label: string; category: string; status: ItemStatus; source: string; details?: string };
export type TaskItem = { id: string; eventType: LifecycleType; title: string; owner: string; executionType: "manual" | "simulated"; status: "open" | "ready" | "done"; dueDate?: string | null; completedAt?: string | null };
export type LifecycleEvent = { id: string; type: LifecycleType; status: string; sourceFilename: string; importedAt: string };
export type EmployeeRecord = {
  id: string; personnelNumber: string; firstName: string; lastName: string; company: string; department: string;
  jobTitle: string; status: "pending" | "active" | "leaving" | "inactive"; startDate?: string | null; endDate?: string | null;
  services: ServiceItem[]; tasks: TaskItem[]; events: LifecycleEvent[];
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
];

export type AutomationJob = {
  schemaVersion: 1;
  jobId: string;
  createdAt: string;
  requestedMode: "WhatIf";
  lifecycleType: LifecycleType;
  person: { personnelNumber: string; firstName: string; lastName: string; displayName: string; department: string; jobTitle: string; company: string; startDate?: string | null; endDate?: string | null };
  directory: { domain: "kauth.local"; samAccountName: string; userPrincipalName: string; mail: string; targetOu: string; disabledOu: "OU=deaktivierte User,DC=kauth,DC=local"; suggestedGroups: string[] };
  helpdesk: { baseUrl: "http://pk-srvhlpdsk001:8002"; subject: string; text: string };
  actions: Array<{ type: string; target: string; requiresApproval: true }>;
};

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const demoEmployees: EmployeeRecord[] = [
  {
    id: "emp-1022", personnelNumber: "1022", firstName: "Chiara", lastName: "Luger", company: "Paul Kauth GmbH & Co. KG",
    department: "913610 Personalwesen", jobTitle: "Personal-Referentin", status: "pending", startDate: "2026-10-01",
    services: ["Notebook", "Internetzugang", "Microsoft Office", "E-Mail-Adresse", "Oder wie MA: L. Romankewicz", "Habel"].map((label, index) => ({ id: `svc-c-${index}`, key: label.toLowerCase().replaceAll(" ", "-"), label, category: index === 0 ? "Gerät" : "Anwendung", status: index < 4 ? "approved" : "requested", source: "Eintritt Laufkarte", details: label === "Habel" ? "Ausnahme: Verantwortlichkeit CO, für IT trotzdem relevant" : "" })),
    tasks: [
      { id: "task-c-1", eventType: "onboarding", title: "Benutzerkonto anlegen", owner: "IT", executionType: "simulated", status: "ready", dueDate: "2026-09-25" },
      { id: "task-c-2", eventType: "onboarding", title: "Notebook vorbereiten und Inventarnummer erfassen", owner: "IT", executionType: "manual", status: "open", dueDate: "2026-09-28" },
      { id: "task-c-3", eventType: "onboarding", title: "Zutrittsrechte wie L. Romankewicz prüfen", owner: "IT / HR", executionType: "manual", status: "open", dueDate: "2026-09-28" },
    ],
    events: [{ id: "evt-c-1", type: "onboarding", status: "in_review", sourceFilename: "Eintritt Laufkarte Frau Chiara Luger ab 01.10.csv", importedAt: "2026-09-17T14:00:00Z" }],
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
  const targetOu = lifecycleType === "offboarding" ? "OU=deaktivierte User,DC=kauth,DC=local" : "REVIEW_REQUIRED";
  const actions = lifecycleType === "offboarding"
    ? ["SnapshotAdAccount", "DisableAdUser", "RemoveGroupMemberships", "MoveAdUser", "CreateHelpdeskTicket"]
    : ["CreateAdUser", ...Array.from(suggestedGroups, (group) => `AddGroup:${group}`), "CreateHelpdeskTicket"];
  const subject = `${lifecycleType === "offboarding" ? "Offboarding" : lifecycleType === "onboarding" ? "Onboarding" : "Wechsel"}: ${person.firstName} ${person.lastName}`;

  return {
    schemaVersion: 1,
    jobId: `lifecycle-${person.personnelNumber}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    requestedMode: "WhatIf",
    lifecycleType,
    person: { personnelNumber: person.personnelNumber, firstName: person.firstName, lastName: person.lastName, displayName: `${person.firstName} ${person.lastName}`, department: person.department, jobTitle: person.jobTitle, company: person.company, startDate: person.startDate, endDate: person.endDate },
    directory: { domain: "kauth.local", samAccountName, userPrincipalName: `${samAccountName}@kauth.de`, mail: `${samAccountName}@kauth.de`, targetOu, disabledOu: "OU=deaktivierte User,DC=kauth,DC=local", suggestedGroups: Array.from(suggestedGroups) },
    helpdesk: { baseUrl: "http://pk-srvhlpdsk001:8002", subject, text: `${subject}\nPersonalnummer: ${person.personnelNumber}\nAbteilung: ${person.department || "nicht angegeben"}\nTermin: ${lifecycleType === "offboarding" ? person.endDate ?? "offen" : person.startDate ?? "offen"}\nQuelle: ${person.events[0]?.sourceFilename ?? "Lifecycle-Portal"}` },
    actions: actions.map((type) => ({ type, target: type.startsWith("AddGroup:") ? type.slice(9) : samAccountName, requiresApproval: true })),
  };
}

export function parseRows(rows: unknown[][], filename: string): EmployeeRecord {
  const normalized = rows.map((row) => row.map(clean));
  const lookup = (label: string) => normalized.find((row) => row[0]?.toLowerCase().startsWith(label.toLowerCase()))?.[1] ?? "";
  const documentTitle = normalized.find((row) => row.some((cell) => /laufkarte\s+(eintritt|austritt)/i.test(cell)))?.join(" ").toLowerCase() ?? filename.toLowerCase();
  const type: LifecycleType = /laufkarte\s+austritt|offboarding/.test(documentTitle) ? "offboarding" : "onboarding";
  const firstName = lookup("Vorname") || "Unbekannt";
  const lastName = lookup("Name") || "Unbekannt";
  const personnelNumber = lookup("Personal Nummer") || lookup("Personalnummer") || `TEMP-${Date.now().toString().slice(-6)}`;
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
    services.forEach((service) => tasks.push({ id: uid("task"), eventType: type, title: `${service.label} bereitstellen`, owner: "IT", executionType: /konto|office|mail|zugang|internet|vpn/i.test(service.label) ? "simulated" : "manual", status: "open" }));
  } else {
    normalized.forEach((row) => {
      if (row[0] && row[4] && !/beschreibung|verantwortlicher/i.test(row[0])) {
        const done = row[6]?.toLowerCase() === "x";
        tasks.push({ id: uid("task"), eventType: type, title: row[0], owner: row[4], executionType: row[4] === "IT" ? "simulated" : "manual", status: done ? "done" : "open", completedAt: done ? isoDate(row[8] || "") : null });
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
  const lines = [
    `$JobPath = '.\\${job.jobId}.json'`,
    `# Ausführung auf PK-SRVMGMT002; Zugangsdaten werden dort lokal abgefragt.`,
    `.\\Invoke-ItLifecycleAgent.ps1 -JobPath $JobPath -Mode WhatIf`,
    "",
    `# Geplante AD-Identität: ${job.directory.userPrincipalName}`,
    `# Ziel-OU: ${job.directory.targetOu}`,
    ...job.actions.map((action) => `# ${action.type} -> ${action.target}`),
  ];
  return lines.join("\n");
}
