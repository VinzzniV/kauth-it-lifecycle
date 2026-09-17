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

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const demoEmployees: EmployeeRecord[] = [
  {
    id: "emp-1022", personnelNumber: "1022", firstName: "Chiara", lastName: "Luger", company: "Paul Kauth GmbH & Co. KG",
    department: "913610 Personalwesen", jobTitle: "Personal-Referentin", status: "pending", startDate: "2026-10-01",
    services: ["Notebook", "Internetzugang", "Microsoft Office", "E-Mail-Adresse", "Habel", "ConSense", "Tisoware Terminal", "Tisoware WEB"].map((label, index) => ({ id: `svc-c-${index}`, key: label.toLowerCase().replaceAll(" ", "-"), label, category: index === 0 ? "Gerät" : "Anwendung", status: index < 4 ? "approved" : "requested", source: "Eintritt Laufkarte", details: label === "Habel" ? "Auswahl aus Laufkarte" : "" })),
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
  const match = value.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : value.slice(0, 10) || null;
}
function keyOf(label: string) { return label.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/(^-|-$)/g, ""); }

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
      if (row[1]?.toUpperCase() === "X" && row[2] && !/^(JA|NEIN)$/i.test(row[2])) {
        const label = row[2];
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
    department: lookup("Abteilung Name") || lookup("Abteilung"), jobTitle: lookup("Stellenbezeichnung"),
    status: type === "offboarding" ? "leaving" : "pending", startDate: isoDate(lookup("Eintritt")),
    endDate: type === "offboarding" ? isoDate(lookup("Austritt") || lookup("Letzter Arbeitstag")) : null,
    services, tasks,
    events: [{ id: uid("evt"), type, status: "in_review", sourceFilename: filename, importedAt: new Date().toISOString() }],
  };
}
