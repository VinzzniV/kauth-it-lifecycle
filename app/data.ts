import { randomId } from "../lib/random-id";
import { explicitReference } from "../lib/ui-projections";

export type LifecycleType = "onboarding" | "change" | "offboarding";
export type ItemStatus =
  "requested" | "approved" | "active" | "remove" | "removed";

export type ServiceItem = {
  id: string;
  key: string;
  label: string;
  category: string;
  status: ItemStatus;
  source: string;
  details?: string;
};
export type TaskItem = {
  lifecycleEventId?: string | null;
  id: string;
  eventType: LifecycleType;
  title: string;
  owner: string;
  executionType: "manual" | "simulated";
  status: "open" | "ready" | "done";
  dueDate?: string | null;
  completedAt?: string | null;
};
export type LifecycleEvent = {
  id: string;
  type: LifecycleType;
  status: string;
  sourceFilename: string;
  importedAt: string;
};
export type AutomationChange = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  relation: string;
  beforeValue?: string | null;
  afterValue?: string | null;
  rollbackAction: string;
  status: string;
};
export type AutomationRun = {
  plannedActions?: { type: string; target: string }[];
  targetAccount?: string;
  alreadyReversedChangeIds?: string[];
  id: string;
  jobId: string;
  operation: "execute" | "rollback" | "reference_check";
  mode: "WhatIf" | "Execute";
  status: string;
  relatedRunId?: string | null;
  canRollback: boolean;
  startedAt: string;
  completedAt?: string | null;
  error?: string;
  changes: AutomationChange[];
  actionResults?: { action: string; status: string; error?: string; automationTaskIds?: string[] }[];
  reviewJson?: string | null;
};

export function failedAutomationAction(run: AutomationRun) {
  return run.actionResults?.find((item) => item.status === "failed")?.action ?? "";
}
export type EmployeeRecord = {
  id: string;
  personnelNumber: string;
  firstName: string;
  lastName: string;
  company: string;
  department: string;
  jobTitle: string;
  status: "pending" | "active" | "leaving" | "inactive" | "completed";
  startDate?: string | null;
  endDate?: string | null;
  directoryTargetOu?: string;
  directoryObjectGuid?: string | null;
  directorySamAccountName?: string | null;
  directoryUpn?: string | null;
  directoryReferenceUser?: string;
  directoryReferenceStatus?: string;
  directoryReferenceMessage?: string;
  shareToken?: string;
  shareExpiresAt?: string | null;
  services: ServiceItem[];
  tasks: TaskItem[];
  events: LifecycleEvent[];
  automationRuns?: AutomationRun[];
  auditEntries?: { id: number; action: string; detail: string; createdAt: string }[];
};

export type MasterDataKind =
  | "location"
  | "group"
  | "application"
  | "task"
  | "ou"
  | "helpdesk";
export type MasterDataItem = {
  id: string;
  kind: MasterDataKind;
  label: string;
  value: string;
  owner: string;
  active: boolean;
};

export const defaultMasterData: MasterDataItem[] = [
  { id: "task-computer-notebook", kind: "task", label: "AD-Notebook anlegen / übernehmen", value: "agent", owner: "IT", active: true },
  { id: "task-computer-workstation", kind: "task", label: "AD-Workstation anlegen / übernehmen", value: "agent", owner: "IT", active: true },
  ...[{ name: "Denkingen", code: "PK" }, { name: "Finnentrop", code: "KF" }, { name: "Solingen", code: "MA" }, { name: "Sulzen", code: "SU" }, { name: "Frittlingen", code: "KW" }].map(({ name, code }) => ({ id: `location-${code.toLowerCase()}`, kind: "location" as const, label: name, value: code, owner: "IT", active: true })),
  { id: "group-pk-all", kind: "group", label: "Denkingen · Alle Benutzer", value: "Denkingen_Alle_Benutzer_GG", owner: "IT", active: true },
  { id: "group-pk-signature", kind: "group", label: "Denkingen · Signatur", value: "Denkingen_MailSignatur_KauthDenkingen_GG", owner: "IT", active: true },
  {
    id: "group-habel",
    kind: "group",
    label: "Habel",
    value: "Habel-User",
    owner: "IT",
    active: true,
  },
  {
    id: "group-caq",
    kind: "group",
    label: "CAQ",
    value: "CAQ-User",
    owner: "IT",
    active: true,
  },
  {
    id: "group-infor",
    kind: "group",
    label: "Infor LN",
    value: "InforLN_UserPRD",
    owner: "IT",
    active: true,
  },
  {
    id: "group-vpn",
    kind: "group",
    label: "VPN Mitarbeiter",
    value: "VPNUser_Mitarbeiter_GG",
    owner: "IT",
    active: true,
  },
  {
    id: "group-internet",
    kind: "group",
    label: "Internet eingeschränkt",
    value: "WG_InternetAccess_Restricted_GG",
    owner: "IT",
    active: true,
  },
  {
    id: "app-office",
    kind: "application",
    label: "Microsoft Office",
    value: "Microsoft Office",
    owner: "IT",
    active: true,
  },
  {
    id: "app-mail",
    kind: "application",
    label: "E-Mail-Adresse",
    value: "E-Mail Adresse",
    owner: "IT",
    active: true,
  },
  {
    id: "app-habel",
    kind: "application",
    label: "Habel",
    value: "Habel",
    owner: "CO / IT",
    active: true,
  },
  {
    id: "task-notebook",
    kind: "task",
    label: "Notebook bereitstellen",
    value: "manual",
    owner: "IT",
    active: true,
  },
  {
    id: "task-account",
    kind: "task",
    label: "Benutzerkonto anlegen",
    value: "agent",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-disabled",
    kind: "ou",
    label: "Deaktivierte Benutzer",
    value: "OU=deaktivierte User,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-pk-notebook",
    kind: "ou",
    label: "Denkingen · Notebook",
    value:
      "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Denkingen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-pk-workstation",
    kind: "ou",
    label: "Denkingen · Workstation",
    value:
      "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Denkingen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-kf-notebook",
    kind: "ou",
    label: "Finnentrop · Notebook",
    value:
      "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Finnentrop,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-kf-workstation",
    kind: "ou",
    label: "Finnentrop · Workstation",
    value:
      "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Finnentrop,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-ma-notebook",
    kind: "ou",
    label: "Solingen · Notebook",
    value:
      "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Solingen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-ma-workstation",
    kind: "ou",
    label: "Solingen · Workstation",
    value:
      "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Solingen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-su-notebook",
    kind: "ou",
    label: "Sulzen · Notebook",
    value: "OU=Notebook,OU=Client,OU=Ressourcen,OU=Sulzen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-su-workstation",
    kind: "ou",
    label: "Sulzen · Workstation",
    value: "OU=Workstation,OU=Client,OU=Ressourcen,OU=Sulzen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-kw-notebook",
    kind: "ou",
    label: "Frittlingen · Notebook",
    value:
      "OU=Notebook,OU=Clients,OU=_Ressourcen,OU=Frittlingen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
  {
    id: "ou-kw-workstation",
    kind: "ou",
    label: "Frittlingen · Workstation",
    value:
      "OU=Workstation,OU=Clients,OU=_Ressourcen,OU=Frittlingen,DC=kauth,DC=local",
    owner: "IT",
    active: true,
  },
];

export type AutomationJob = {
  schemaVersion: 1;
  jobId: string;
  createdAt: string;
  operation: "execute";
  requestedMode: "WhatIf" | "Execute";
  lifecycleType: LifecycleType;
  person: {
    employeeId: string;
    personnelNumber: string;
    firstName: string;
    lastName: string;
    displayName: string;
    department: string;
    jobTitle: string;
    company: string;
    startDate?: string | null;
    endDate?: string | null;
  };
  directory: {
    objectGuid?: string | null;
    domain: string;
    samAccountName: string;
    userPrincipalName: string;
    mail: string;
    description: string;
    title: string;
    targetOu: string;
    disabledOu: string;
    suggestedGroups: string[];
    referenceUser: {
      displayName: string;
      query: string;
      givenNameInitial: string;
      surname: string;
    } | null;
    computers: Array<{
      type: "Notebook" | "Workstation";
      mode: "new" | "existing";
      existingName?: string;
      prefix: string;
      targetOu: string;
      description: string;
    }>;
  };
  helpdesk: {
    baseUrl: string;
    subject: string;
    text: string;
    resource?: string;
  };
  microsoft365: {
    syncServer: string;
    skuPartNumber: "SPB";
    usageLocation: "DE";
    userSyncTimeoutMinutes: 15;
    mailboxTimeoutMinutes: 15;
  };
  automationTaskIds: string[];
  actionTaskIds: Record<string, string[]>;
  actionServiceIds: Record<string, string[]>;
  actions: Array<{ type: string; target: string; requiresApproval: true }>;
};

export type ComputerAssignments = Partial<
  Record<
    "Notebook" | "Workstation",
    { mode: "new" | "existing"; existingName?: string }
  >
>;

const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const demoEmployees: EmployeeRecord[] = [
  {
    id: "emp-1022",
    personnelNumber: "1022",
    firstName: "Chiara",
    lastName: "Luger",
    company: "Paul Kauth GmbH & Co. KG - 78588 Denkingen",
    department: "Personalwesen",
    jobTitle: "Personal-Referentin",
    status: "pending",
    startDate: "2026-10-01",
    services: [
      "Notebook",
      "Internetzugang",
      "Microsoft Office",
      "E-Mail-Adresse",
      "Oder wie MA: L. Romankewicz",
      "Habel",
    ].map((label, index) => ({
      id: `svc-c-${index}`,
      key: label.toLowerCase().replaceAll(" ", "-"),
      label,
      category: index === 0 ? "Gerät" : "Anwendung",
      status: index < 4 ? "approved" : "requested",
      source: "Eintritt Laufkarte",
      details:
        label === "Habel"
          ? "Ausnahme: Verantwortlichkeit CO, für IT trotzdem relevant"
          : "",
    })),
    tasks: [
      {
        id: "task-c-1",
        eventType: "onboarding",
        title: "Benutzerkonto anlegen",
        owner: "IT",
        executionType: "simulated",
        status: "ready",
        dueDate: "2026-09-25",
      },
      {
        id: "task-c-2",
        eventType: "onboarding",
        title: "Notebook vorbereiten und Inventarnummer erfassen",
        owner: "IT",
        executionType: "manual",
        status: "open",
        dueDate: "2026-09-28",
      },
      {
        id: "task-c-3",
        eventType: "onboarding",
        title: "Zutrittsrechte wie L. Romankewicz prüfen",
        owner: "IT / HR",
        executionType: "manual",
        status: "open",
        dueDate: "2026-09-28",
      },
    ],
    events: [
      {
        id: "evt-c-1",
        type: "onboarding",
        status: "in_review",
        sourceFilename:
          "Eintritt Laufkarte Frau Chiara Luger ab 01.10.2026 Fachbereich HR.xlsx",
        importedAt: "2026-09-18T08:00:00Z",
      },
    ],
  },
  {
    id: "emp-1524",
    personnelNumber: "1524",
    firstName: "Mert",
    lastName: "Yelmen",
    company: "Paul Kauth GmbH & Co. KG",
    department: "Montage Werk 2",
    jobTitle: "Einrichter",
    status: "leaving",
    startDate: "2021-09-01",
    endDate: "2026-08-31",
    services: [
      "Telefonbucheintrag",
      "E-Mail & Verteiler",
      "Mobile IT-Geräte",
      "Gewatec",
      "Infor LN",
      "CAQ-System",
      "Habel",
    ].map((label, index) => ({
      id: `svc-m-${index}`,
      key: label.toLowerCase().replaceAll(" ", "-"),
      label,
      category: index === 2 ? "Gerät" : "Anwendung",
      status: index === 3 || index === 4 ? "removed" : "remove",
      source: "Austritt Laufkarte",
    })),
    tasks: [
      {
        id: "task-m-1",
        eventType: "offboarding",
        title: "Gewatec Account löschen",
        owner: "IT",
        executionType: "simulated",
        status: "done",
        completedAt: "2026-08-28",
      },
      {
        id: "task-m-2",
        eventType: "offboarding",
        title: "E-Mail-Weiterleitung und Abwesenheitsnotiz einrichten",
        owner: "IT",
        executionType: "simulated",
        status: "ready",
        dueDate: "2026-08-31",
      },
      {
        id: "task-m-3",
        eventType: "offboarding",
        title: "Mobile Geräte zurücknehmen",
        owner: "IT",
        executionType: "manual",
        status: "open",
        dueDate: "2026-08-31",
      },
    ],
    events: [
      {
        id: "evt-m-1",
        type: "offboarding",
        status: "in_progress",
        sourceFilename: "Offboarding Mert Yelmen.xlsx",
        importedAt: "2026-09-17T14:10:00Z",
      },
    ],
  },
];

function clean(value: unknown) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
export function isoDate(value: string) {
  if (!value.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return validDate(value.trim());
  const german = value.trim().match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{2}|\d{4})$/);
  if (german) {
    const year = german[3].length === 2 ? `20${german[3]}` : german[3];
    return validDate(`${year}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`);
  }
  const slash = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return validDate(`${year}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`);
  }
  return validDate(value.trim());
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new Error(`Ungültiges Datum: ${value}`);
  return value;
}
function keyOf(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function accountPart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]/g, "");
}

export function mergeMasterData(items: MasterDataItem[]): MasterDataItem[] {
  const merged = new Map(defaultMasterData.map((item) => [item.id, item]));
  items.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

export function applyMasterData(person: EmployeeRecord, items: MasterDataItem[]): EmployeeRecord {
  const rules = mergeMasterData(items);
  const tasks = person.tasks.map((task) => {
    if (task.status === "done" || (task.lifecycleEventId && task.lifecycleEventId !== person.events[0]?.id)) return task;
    const application = rules.find((item) => item.kind === "application" && task.title.toLowerCase().includes(item.label.toLowerCase()));
    const group = rules.find((item) => item.kind === "group" && task.title.toLowerCase().includes(item.label.toLowerCase().split(/[ ·]/)[0]));
    const rule = rules.find((item) => item.kind === "task" && item.label.toLowerCase() === task.title.toLowerCase())
      ?? rules.find((item) => item.kind === "task" && ((item.id === "task-notebook" && /notebook|laptop/i.test(task.title)) || (item.id === "task-account" && /benutzerkonto|konto anlegen/i.test(task.title))));
    if (!rule) return { ...task, owner: application?.owner ?? task.owner, ...(application?.active === false || group?.active === false ? { executionType: "manual" as const, status: "open" as const } : {}) };
    return { ...task, owner: rule.owner, executionType: rule.active && rule.value === "agent" ? "simulated" as const : "manual" as const, status: rule.active && rule.value === "agent" ? "ready" as const : "open" as const };
  });
  return { ...person, tasks, services: person.services.map((service) => {
    const rule = rules.find((item) => item.kind === "application" && item.label.toLowerCase() === service.label.toLowerCase());
    return rule?.active ? { ...service, details: rule.value } : service;
  }) };
}

export function buildAutomationJob(
  person: EmployeeRecord,
  computerAssignments: ComputerAssignments = {},
  options: { portalBaseUrl?: string; helpdeskResource?: string; masterData?: MasterDataItem[]; domain?: string; mailDomain?: string; helpdeskBaseUrl?: string; syncServer?: string } = {},
): AutomationJob {
  const rules = mergeMasterData(options.masterData ?? []);
  person = { ...person, tasks: person.tasks.filter((task) => !task.lifecycleEventId || task.lifecycleEventId === person.events[0]?.id) };
  person = applyMasterData(person, rules);
  const lifecycleType = person.events[0]?.type ?? "change";
  const samAccountName = person.directorySamAccountName || `${accountPart(person.firstName)}.${accountPart(person.lastName)}`;
  const serviceText = person.services
    .map((service) => `${service.label} ${service.details ?? ""}`.toLowerCase())
    .join(" ");
  const suggestedGroups = new Set<string>();
  rules.filter((item) => item.kind === "group" && item.active && !rules.some((app) => app.kind === "application" && !app.active && app.label.toLowerCase().includes(item.label.toLowerCase().split(/[ ·]/)[0])) && (serviceText.includes(item.label.toLowerCase().split(/[ ·]/)[0]) || (item.label.includes(" · ") && `${person.department} ${person.company}`.toLowerCase().includes(item.label.split(" · ")[0].toLowerCase())))).forEach((item) => suggestedGroups.add(item.value));
  const referenceName = getReferenceUserName(person);
  const referenceParts = referenceName.split(/\s+/).filter(Boolean);
  const referenceUser = referenceName
    ? {
        displayName: referenceName,
        query: referenceName,
        givenNameInitial:
          referenceParts[0]?.replace(/\.$/, "").slice(0, 1).toUpperCase() ?? "",
        surname: referenceParts.at(-1) ?? "",
      }
    : null;
  const locationText = `${person.company} ${person.department}`.toLowerCase();
  const locations = [
    {
      name: "Denkingen",
      token: "denkingen",
      code: "PK",
      base: "OU=Clients,OU=_Ressourcen,OU=Denkingen,DC=kauth,DC=local",
    },
    {
      name: "Finnentrop",
      token: "finnentrop",
      code: "KF",
      base: "OU=Clients,OU=_Ressourcen,OU=Finnentrop,DC=kauth,DC=local",
    },
    {
      name: "Solingen",
      token: "solingen",
      code: "MA",
      base: "OU=Clients,OU=_Ressourcen,OU=Solingen,DC=kauth,DC=local",
    },
    {
      name: "Sulzen",
      token: "sulzen",
      code: "SU",
      base: "OU=Client,OU=Ressourcen,OU=Sulzen,DC=kauth,DC=local",
    },
    {
      name: "Frittlingen",
      token: "frittlingen",
      code: "KW",
      base: "OU=Clients,OU=_Ressourcen,OU=Frittlingen,DC=kauth,DC=local",
    },
  ];
  const configuredLocation = rules.find((item) => item.kind === "location" && item.active && locationText.includes(item.label.toLowerCase()));
  const location = configuredLocation ? { name: configuredLocation.label, code: configuredLocation.value, token: configuredLocation.label.toLowerCase(), base: locations.find((item) => item.code === configuredLocation.value)?.base ?? "" } : undefined;
  const computerOu = (type: string) => {
    if (!location) return "REVIEW_REQUIRED";
    const matches = rules.filter((item) => item.kind === "ou" && (item.label.toLowerCase() === `${location.name} · ${type}`.toLowerCase() || item.id === `ou-${location.code.toLowerCase()}-${type.toLowerCase()}`));
    return matches.length === 1 && matches[0].active ? matches[0].value : "REVIEW_REQUIRED";
  };
  const computerDescription = `${person.department || "Keine Abteilung"} / ${person.firstName} ${person.lastName}`;
  const computers: AutomationJob["directory"]["computers"] = [];
  if (
    lifecycleType === "onboarding" &&
    person.services.some((service) => /notebook|laptop/i.test(service.label))
  )
    computers.push({
      type: "Notebook",
      mode: computerAssignments.Notebook?.mode ?? "new",
      existingName: computerAssignments.Notebook?.existingName
        ?.trim()
        .toUpperCase(),
      prefix: location ? `${location.code}-CLNB` : "REVIEW_REQUIRED",
      targetOu: computerOu("Notebook"),
      description: computerDescription,
    });
  if (
    lifecycleType === "onboarding" &&
    person.services.some((service) =>
      /fester rechner|workstation|desktop/i.test(service.label),
    )
  )
    computers.push({
      type: "Workstation",
      mode: computerAssignments.Workstation?.mode ?? "new",
      existingName: computerAssignments.Workstation?.existingName
        ?.trim()
        .toUpperCase(),
      prefix: location ? `${location.code}-CLWS` : "REVIEW_REQUIRED",
      targetOu: computerOu("Workstation"),
      description: computerDescription,
    });
  const targetOu =
    lifecycleType === "offboarding"
      ? rules.find((item) => item.id === "ou-disabled" && item.active)?.value || "REVIEW_REQUIRED"
      : person.directoryTargetOu?.trim() ||
        (referenceUser ? "REFERENCE_USER_OU" : "REVIEW_REQUIRED");
  const needsMailbox =
    lifecycleType !== "offboarding" &&
    person.services.some((service) => /e-?mail|postfach/i.test(service.label)) &&
    rules.some((item) => item.id === "app-mail" && item.active);
  const plannedActions =
    lifecycleType === "offboarding"
      ? [
          "SnapshotAdAccount",
          "DisableAdUser",
          "RemoveGroupMemberships",
          "MoveAdUser",
          "CreateHelpdeskTicket",
        ]
      : [
          lifecycleType === "change" ? "UpdateAdUser" : "CreateAdUser",
          ...(referenceUser ? ["CopyGroupsFromReference"] : []),
          ...Array.from(suggestedGroups, (group) => `AddGroup:${group}`),
          ...computers.map(
            (computer) =>
              `${computer.mode === "existing" ? "ReuseAdComputer" : "CreateAdComputer"}:${computer.type}`,
          ),
          ...(needsMailbox ? ["ProvisionM365Mailbox"] : []),
          "CreateHelpdeskTicket",
        ];
  const enabledAgentRule = (id: string) => rules.some((item) => item.id === id && item.active && item.value === "agent");
  const actions = plannedActions.filter((action) => {
    const explicitlyManual = person.tasks.some((task) => {
      if (!actionMatches(action, task.title, rules)) return false;
      // Physical delivery and the separate AD computer operation have independent rules.
      if (/AdComputer:/.test(action) && !/^AD[- ]|AD-Computer/i.test(task.title)) return false;
      const rule = rules.find((item) => item.kind === "task" && item.label.toLowerCase() === task.title.toLowerCase());
      return rule !== undefined && (!rule.active || rule.value !== "agent");
    });
    if (explicitlyManual) return false;
    if (action === "CreateAdUser" || action === "UpdateAdUser") return enabledAgentRule("task-account");
    if (/AdComputer:Notebook$/.test(action)) return enabledAgentRule("task-computer-notebook");
    if (/AdComputer:Workstation$/.test(action)) return enabledAgentRule("task-computer-workstation");
    return true;
  });
  const subject = `${lifecycleType === "offboarding" ? "Offboarding" : lifecycleType === "onboarding" ? "Onboarding" : "Wechsel"}: ${person.firstName} ${person.lastName}`;
  const completedTasks = person.tasks.filter((task) => task.status === "done").length;
  const taskLines = person.tasks.length
    ? person.tasks.map((task) => {
        const marker = task.status === "done" ? "[x]" : "[ ]";
        const execution = task.executionType === "simulated" && task.status !== "done"
          ? " (wird durch die Automation bearbeitet)"
          : "";
        return `${marker} ${task.title} - ${task.owner}${execution}`;
      })
    : ["Keine Aufgaben hinterlegt."];
  const portalBaseUrl = options.portalBaseUrl?.replace(/\/$/, "");
  const statusUrl = portalBaseUrl && person.shareToken
    ? `${portalBaseUrl}/status/${person.shareToken}`
    : "";
  const ticketText = [
    subject,
    `Personalnummer: ${person.personnelNumber}`,
    `Abteilung: ${person.department || "nicht angegeben"}`,
    `Termin: ${lifecycleType === "offboarding" ? (person.endDate ?? "offen") : (person.startDate ?? "offen")}`,
    `Quelle: ${person.events[0]?.sourceFilename ?? "Lifecycle-Portal"}`,
    "",
    `Aufgabenstand: ${completedTasks} von ${person.tasks.length} erledigt`,
    ...taskLines,
    ...(statusUrl ? ["", `Aktueller Stand im IT-Lifecycle: ${statusUrl}`] : []),
  ].join("\n");

  return {
    schemaVersion: 1,
    operation: "execute",
    jobId: `lifecycle-${randomId()}`,
    createdAt: new Date().toISOString(),
    requestedMode: "WhatIf",
    lifecycleType,
    person: {
      employeeId: person.id,
      personnelNumber: person.personnelNumber,
      firstName: person.firstName,
      lastName: person.lastName,
      displayName: `${person.lastName} ${person.firstName}`,
      department: person.department,
      jobTitle: person.jobTitle,
      company: person.company,
      startDate: person.startDate,
      endDate: person.endDate,
    },
    directory: {
      objectGuid: person.directoryObjectGuid,
      domain: options.domain || "kauth.local",
      samAccountName,
      userPrincipalName: person.directoryUpn || `${samAccountName}@${options.mailDomain || "kauth.de"}`,
      mail: person.directoryUpn || `${samAccountName}@${options.mailDomain || "kauth.de"}`,
      description: person.jobTitle,
      title: person.jobTitle,
      targetOu,
      disabledOu: rules.find((item) => item.id === "ou-disabled" && item.active)?.value || "REVIEW_REQUIRED",
      suggestedGroups: Array.from(suggestedGroups),
      referenceUser,
      computers,
    },
    helpdesk: {
      baseUrl: options.helpdeskBaseUrl || "http://pk-srvhlpdsk001:8002",
      subject,
      text: ticketText,
      resource: options.helpdeskResource?.trim() || undefined,
    },
    microsoft365: {
      syncServer: options.syncServer || "PK-SRVMGMT001",
      skuPartNumber: "SPB",
      usageLocation: "DE",
      userSyncTimeoutMinutes: 15,
      mailboxTimeoutMinutes: 15,
    },
    automationTaskIds: person.tasks
      .filter(
        (task) => task.executionType === "simulated" && task.status !== "done",
      )
      .map((task) => task.id),
    actionTaskIds: Object.fromEntries(actions.map((action) => [action, person.tasks.filter((task) => task.executionType === "simulated" && task.status !== "done" && actionMatches(action, task.title, rules)).map((task) => task.id)])),
    actionServiceIds: Object.fromEntries(actions.map((action) => [action, person.services.filter((service) => actionMatches(action, service.label, rules)).map((service) => service.id)])),
    actions: actions.map((type) => ({
      type,
      target: type.startsWith("AddGroup:")
        ? type.slice(9)
        : type.startsWith("CreateAdComputer:")
          ? computers.find((computer) => type.endsWith(computer.type))?.prefix +
            "xxx"
          : type.startsWith("ReuseAdComputer:")
            ? computers.find((computer) => type.endsWith(computer.type))
                ?.existingName || "COMPUTERNAME_REQUIRED"
            : type === "CopyGroupsFromReference"
              ? (referenceUser?.displayName ?? "Referenzbenutzer")
              : type === "ProvisionM365Mailbox"
                ? `${person.directoryUpn || `${samAccountName}@${options.mailDomain || "kauth.de"}`} · Microsoft 365 Business Premium`
              : samAccountName,
      requiresApproval: true,
    })),
  };
}

function actionMatches(action: string, title: string, rules: MasterDataItem[]) {
  if (action === "ProvisionM365Mailbox") return /e-?mail|postfach/i.test(title);
  if (action === "CreateAdUser" || action === "UpdateAdUser") return /benutzerkonto|konto anlegen|konto bereitstellen/i.test(title);
  if (action === "DisableAdUser") return /benutzerkonto|active directory|ad-benutzer|it-zugänge.*deaktiviert|netzwerkzugang/i.test(title);
  if (action === "RemoveGroupMemberships") {
    if (/AD[- ]Gruppen(?:mitgliedschaften)?(?:\s|$)|Active Directory.*Gruppen/i.test(title)) return true;
    // Only group-mediated access is removed here; an external application account stays manual.
    if (!/^(?:VPN(?: Mitarbeiter)?|Internetzugang|Internet(?: eingeschränkt)?|AD[- ]Gruppe\s*:.*)$/i.test(title)) return false;
    return rules.some((item) => item.kind === "group" && (title.toLowerCase().includes(item.label.toLowerCase().split(/[ ·]/)[0]) || title.toLowerCase().includes(item.value.toLowerCase())));
  }
  if (/AdComputer:Notebook$/.test(action)) return /notebook|laptop/i.test(title);
  if (/AdComputer:Workstation$/.test(action)) return /rechner|workstation|desktop/i.test(title);
  if (action.startsWith("AddGroup:")) return rules.some((item) => item.kind === "group" && item.value === action.slice(9) && title.toLowerCase().includes(item.label.toLowerCase().split(/[ ·]/)[0]));
  if (action === "CopyGroupsFromReference") return /wie\s+(?:ma\s*:)?/i.test(title);
    return false;
}

export function parseRows(rows: unknown[][], filename: string): EmployeeRecord {
  const normalized = rows.map((row) => row.map(clean));
  const lookup = (label: string) =>
    normalized.find((row) =>
      row[0]?.toLowerCase().startsWith(label.toLowerCase()),
    )?.[1] ?? "";
  const documentTitle =
    normalized
      .find((row) =>
        row.some((cell) => /laufkarte\s+(eintritt|austritt|wechsel)|wechsel|change/i.test(cell)),
      )
      ?.join(" ")
      .toLowerCase() ?? filename.toLowerCase();
  const type: LifecycleType = /laufkarte\s+austritt|offboarding/.test(
    documentTitle,
  )
    ? "offboarding"
    : /wechsel|change|versetzung/.test(documentTitle) ? "change" : "onboarding";
  const firstName = lookup("Vorname");
  const lastName = lookup("Name");
  const personnelNumber = lookup("Personal Nummer") || lookup("Personalnummer");
  if (!firstName || !lastName)
    throw new Error("Vorname oder Nachname konnte nicht erkannt werden.");
  if (!personnelNumber)
    throw new Error("Die Personalnummer konnte nicht erkannt werden.");
  const services: ServiceItem[] = [];
  const tasks: TaskItem[] = [];

  if (type !== "offboarding") {
    normalized.forEach((row) => {
      const selected = row[1]?.toUpperCase() === "X";
      const owner = row[0]?.toLowerCase() ?? "";
      const label = row[2] ?? "";
      const belongsToIt =
        /^it(?:\s|:|$)/i.test(owner) || /^habel$/i.test(label);
      if (selected && belongsToIt && label && !/^(JA|NEIN)$/i.test(label)) {
        services.push({
          id: uid("svc"),
          key: keyOf(label),
          label,
          category: explicitReference(label) ? "Referenz" : /notebook|rechner|telefon|handy|kleidung/i.test(label)
            ? "Gerät"
            : "Anwendung",
          status: "requested",
          source: filename,
        });
      }
    });
    services.forEach((service) => {
      if (service.category === "Referenz") return;
      const executionType =
        /konto|mail|zugang|internet|vpn|wie\s+(?:ma\s*:\s*)?/i.test(
          service.label,
        )
          ? "simulated"
          : "manual";
      tasks.push({
        id: uid("task"),
        eventType: type,
        title: `${service.label} bereitstellen`,
        owner: "IT",
        executionType,
        status: executionType === "simulated" ? "ready" : "open",
      });
    });
  } else {
    normalized.forEach((row) => {
      const owner = row[4]?.toLowerCase() ?? "";
      const belongsToIt =
        /(^|\W)it(\W|$)/i.test(owner) || /habel/i.test(row[0] ?? "");
      if (
        row[0] &&
        row[4] &&
        belongsToIt &&
        !/beschreibung|verantwortlicher/i.test(row[0])
      ) {
        const done = row[6]?.toLowerCase() === "x";
        const executionType =
          /benutzerkonto|active directory|ad-benutzer|AD[- ]Gruppen(?:mitgliedschaften)?|it-zugänge.*deaktiviert|netzwerkzugang/i.test(
            row[0],
          ) && /(^|\W)it(\W|$)/i.test(owner)
            ? "simulated"
            : "manual";
        tasks.push({
          id: uid("task"),
          eventType: type,
          title: row[0],
          owner: row[4],
          executionType,
          status: done
            ? "done"
            : executionType === "simulated"
              ? "ready"
              : "open",
          completedAt: done ? isoDate(row[8] || "") : null,
        });
        if (/account|zugang|mail|system|gerät|telefon/i.test(row[0]))
          services.push({
            id: uid("svc"),
            key: keyOf(row[0]),
            label: row[0],
            category: /gerät|telefon/i.test(row[0]) ? "Gerät" : "Anwendung",
            status: done ? "removed" : "remove",
            source: filename,
          });
      }
    });
  }

  if (type === "offboarding") {
    for (const title of ["M365: Sitzungen, Lizenzen und Postfach nach freigegebener Vorgabe manuell bearbeiten", "HelpDesk: Offboarding-Nacharbeit und offene Tickets prüfen"]) {
      if (!tasks.some((task) => task.title === title)) tasks.push({ id: uid("task"), eventType: type, title, owner: "IT", executionType: "manual", status: "open" });
    }
  }
  return {
    id: `emp-${personnelNumber}`,
    personnelNumber,
    firstName,
    lastName,
    company: lookup("Unternehmen"),
    department: cleanDepartment(
      lookup("Abteilung Name") || lookup("Abteilung"),
    ),
    jobTitle:
      lookup("Stellenbezeichnung") || lookup("Position") || lookup("Tätigkeit"),
    directoryReferenceUser: referenceNameFromServices(services),
    directoryReferenceStatus: referenceNameFromServices(services)
      ? "pending"
      : "",
    status: type === "offboarding" ? "leaving" : "pending",
    startDate: isoDate(lookup("Eintritt")),
    endDate:
      type === "offboarding"
        ? isoDate(lookup("Austritt") || lookup("Letzter Arbeitstag"))
        : null,
    services,
    tasks,
    events: [
      {
        id: uid("evt"),
        type,
        status: "in_review",
        sourceFilename: filename,
        importedAt: new Date().toISOString(),
      },
    ],
  };
}

function cleanDepartment(value: string) {
  return value.replace(/^\s*\d{3,}\s*(?:[-/:]\s*)?/, "").trim();
}

export function getReferenceUserName(person: EmployeeRecord) {
  if (person.directoryReferenceUser?.trim())
    return person.directoryReferenceUser.trim();
  return referenceNameFromServices(person.services);
}

function referenceNameFromServices(services: ServiceItem[]) {
  const referenceLabel =
    services.find((service) => /\bwie\b/i.test(service.label))?.label ?? "";
  return (
    referenceLabel.match(/\bwie\b\s*(?:MA\s*:\s*)?(.+)/i)?.[1]?.trim() ?? ""
  );
}

export function buildPowerShellPreview(
  person: EmployeeRecord,
  preparedJob?: AutomationJob,
) {
  const job = preparedJob ?? buildAutomationJob(person);
  const lines = [
    "IT Lifecycle · Auftragsvorschau",
    `Vorgang: ${job.lifecycleType} · ${job.person.displayName}`,
    `Anmeldename: ${job.directory.samAccountName}`,
    `UPN: ${job.directory.userPrincipalName}`,
    `Ziel-OU: ${job.directory.targetOu}`,
    "",
    "Geplante Aktionen:",
    ...job.actions.map((action, index) => `${index + 1}. ${action.type}: ${action.target}`),
    "",
    "Testlauf oder Ausführung über die internen Schaltflächen starten.",
    "Die Ausführung benötigt eine ausdrückliche Freigabe und wird vom Windows-Gateway übernommen.",
    "Der Server speichert Auftrag und Ergebnis dauerhaft; das Browserfenster kann geschlossen werden.",
    "Fehlgeschlagene Einzelaktionen und unterstützte Rücknahmen werden in der Akte bearbeitet.",
    "Diese Vorschau enthält keine ausführbaren Befehle und keine Zugangsdaten.",
  ];
  return lines.join("\n");
}
