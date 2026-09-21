"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { read, utils } from "xlsx";
import {
  Activity,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileCode2,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  Link2,
  ListChecks,
  Mail,
  Plus,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  TicketCheck,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AutomationChange,
  AutomationRun,
  buildAutomationJob,
  buildPowerShellPreview,
  ComputerAssignments,
  defaultMasterData,
  EmployeeRecord,
  failedAutomationAction,
  getReferenceUserName,
  MasterDataItem,
  MasterDataKind,
  parseRows,
  TaskItem,
} from "./data";

export type AppView =
  "overview" | "people" | "tasks" | "automations" | "master-data";
type ApiMessage = { error?: string; id?: string; jobId?: string };
type EmployeeListResponse = ApiMessage & { employees?: EmployeeRecord[] };
type AdCredential = { username: string; password: string };
type ExecutionLogEntry = {
  time: string;
  action: string;
  state: string;
  message: string;
};
type ImmediateExecutionResult = {
  runId?: string;
  jobId?: string;
  operation?: string;
  mode?: "WhatIf" | "Execute";
  status?: string;
  error?: string;
  changes: AutomationChange[];
  log?: ExecutionLogEntry[];
};
type RunningExecutionProgress = {
  status: "running";
  startedAt?: string;
  updatedAt?: string;
  currentAction?: string;
  log?: ExecutionLogEntry[];
};
const viewMeta: Record<AppView, { title: string; eyebrow: string }> = {
  overview: { title: "Lifecycle-Übersicht", eyebrow: "Heute" },
  people: { title: "Mitarbeiterakten", eyebrow: "Personen" },
  tasks: { title: "Aufgaben", eyebrow: "Arbeitsvorrat" },
  automations: { title: "Automationen", eyebrow: "AD & HelpDesk" },
  "master-data": { title: "Stammdaten", eyebrow: "Konfiguration" },
};
const statusText: Record<string, string> = {
  pending: "In Prüfung",
  active: "Aktiv",
  leaving: "Austritt läuft",
  inactive: "Inaktiv",
  completed: "Abgeschlossen",
  requested: "Beantragt",
  approved: "Freigegeben",
  remove: "Zu entfernen",
  removed: "Entfernt",
  open: "Offen",
  ready: "Bereit",
  done: "Erledigt",
  queued: "Wartet",
  partial: "Teilweise",
  failed: "Fehlgeschlagen",
  rolled_back: "Zurückgenommen",
};
const executionActionText: Record<string, string> = {
  CreateAdUser: "AD-Benutzer anlegen",
  CopyGroupsFromReference: "Gruppen des Referenzbenutzers kopieren",
  SnapshotAdAccount: "AD-Konto erfassen",
  DisableAdUser: "AD-Benutzer deaktivieren",
  RemoveGroupMemberships: "Gruppenmitgliedschaften entfernen",
  MoveAdUser: "AD-Benutzer verschieben",
  CreateHelpdeskTicket: "HelpDesk-Ticket erstellen",
  ProvisionM365Mailbox: "Microsoft-365-Postfach bereitstellen",
  "AD-Verbindung pruefen": "AD-Verbindung prüfen",
  "Vorbedingungen pruefen": "Vorbedingungen prüfen",
  "Referenzbenutzer suchen": "Referenzbenutzer suchen",
  "Run failed": "Ausführung fehlgeschlagen",
};
function executionActionLabel(action: string) {
  if (action.startsWith("AddGroup:"))
    return `AD-Gruppe hinzufügen: ${action.slice(9)}`;
  if (action.startsWith("CreateAdComputer:"))
    return `${action.slice(17)} im AD anlegen`;
  if (action.startsWith("ReuseAdComputer:"))
    return `${action.slice(16)} übernehmen`;
  return executionActionText[action] ?? action;
}
const kindText: Record<MasterDataKind, string> = {
  group: "Gruppen",
  application: "Anwendungen",
  task: "Aufgaben",
  ou: "OU-Zuordnung",
  helpdesk: "HelpDesk",
};
function automationOptions(items: MasterDataItem[]) {
  const helpdeskResource = items
    .filter((item) => item.kind === "helpdesk" && item.active && item.value.trim())
    .at(-1);
  return {
    portalBaseUrl: typeof window === "undefined" ? "" : window.location.origin,
    helpdeskResource: helpdeskResource?.value,
  };
}
function badgeClass(status: string) {
  if (["active", "completed", "done", "removed"].includes(status))
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["leaving", "remove", "failed"].includes(status))
    return "border-rose-200 bg-rose-50 text-rose-700";
  if (["ready", "approved", "queued"].includes(status))
    return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
function initials(person: EmployeeRecord) {
  return `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();
}
function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";
}
function downloadText(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
function downloadJob(job: ReturnType<typeof buildAutomationJob>) {
  downloadText(
    `${job.jobId}.json`,
    JSON.stringify(job, null, 2),
    "application/json",
  );
}
async function collectExecutionResult(
  jobId: string,
  onComplete: () => void,
  onResult?: (result: ImmediateExecutionResult) => void,
  onProgress?: (message: string) => void,
  onLiveProgress?: (progress: RunningExecutionProgress) => void,
) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const response = await fetch(
      `/api/agent?jobId=${encodeURIComponent(jobId)}`,
    );
    if (response.status === 202) {
      const progress = (await response.json().catch(() => ({
        status: "running",
      }))) as RunningExecutionProgress;
      onLiveProgress?.(progress);
      const currentAction =
        progress.currentAction ?? progress.log?.at(-1)?.action;
      onProgress?.(
        currentAction
          ? `Läuft: ${executionActionLabel(currentAction)}`
          : `Der Auftrag läuft auf dem Jobserver seit mindestens ${attempt * 2} Sekunden …`,
      );
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      continue;
    }
    if (response.ok) {
      const result = (await response.json()) as ImmediateExecutionResult;
      onResult?.({ ...result, changes: result.changes ?? [] });
      const stored = await fetch("/api/executions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      if (stored.ok) {
        onComplete();
        if (result.status === "failed")
          return `Ausführung fehlgeschlagen und wurde protokolliert: ${result.error || "Unbekannter Fehler"}`;
        if (result.status === "partial")
          return `Ausführung nur teilweise abgeschlossen und wurde protokolliert: ${result.error || "Bitte den Verlauf prüfen."}`;
        if (result.operation === "reference_check")
          return "Referenzprüfung wurde in der Mitarbeiterakte gespeichert.";
        return `Ergebnis mit ${result.changes?.length ?? 0} protokollierten Änderung(en) wurde in der Mitarbeiterakte gespeichert.`;
      }
      const storageError = (await stored
        .json()
        .catch(() => ({}))) as ApiMessage;
      return `Ergebnis liegt vor, konnte aber nicht gespeichert werden: ${storageError.error ?? `HTTP ${stored.status}`}`;
    }
    const pollError = (await response.json().catch(() => ({}))) as ApiMessage;
    return (
      pollError.error ??
      `Der Ergebnisabruf wurde beendet (HTTP ${response.status}).`
    );
  }
  return "Die Ausführung läuft weiter. Das Ergebnis kann später erneut geladen werden.";
}

export function LifecycleApp({ view = "overview" }: { view?: AppView }) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [masterData, setMasterData] =
    useState<MasterDataItem[]>(defaultMasterData);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState("");
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [draft, setDraft] = useState<EmployeeRecord | null>(null);
  const [importError, setImportError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recoveringJobs = useRef(new Set<string>());

  async function refreshEmployees() {
    const response = await fetch("/api/employees");
    const data = (await response
      .json()
      .catch(() => ({}))) as EmployeeListResponse;
    if (!response.ok)
      throw new Error(
        data.error || "Mitarbeiterakten konnten nicht geladen werden.",
      );
    setEmployees(data.employees ?? []);
    setActiveId((current) =>
      data.employees?.some((item: EmployeeRecord) => item.id === current)
        ? current
        : (data.employees?.[0]?.id ?? ""),
    );
  }
  useEffect(() => {
    queueMicrotask(() => {
      void refreshEmployees()
        .catch((error) =>
          setAppError(
            error instanceof Error
              ? error.message
              : "Daten konnten nicht geladen werden.",
          ),
        )
        .finally(() => setLoading(false));
    });
  }, []);
  useEffect(() => {
    fetch("/api/master-data")
      .then(async (r) =>
        r.ok ? ((await r.json()) as { items?: MasterDataItem[] }) : null,
      )
      .then((data) => {
        if (!data?.items) return;
        const merged = new Map(
          defaultMasterData.map((item) => [item.id, item]),
        );
        data.items.forEach((item) => merged.set(item.id, item));
        setMasterData(
          Array.from(merged.values()).filter((item) => item.active),
        );
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: { registerTool?: (tool: unknown) => void };
      }
    ).modelContext;
    context?.registerTool?.({
      name: "open_employee_record",
      title: "Mitarbeiterakte öffnen",
      description: "Öffnet eine Mitarbeiterakte anhand der Personalnummer.",
      inputSchema: {
        type: "object",
        properties: { personnelNumber: { type: "string" } },
        required: ["personnelNumber"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input: { personnelNumber: string }) => {
        const person = employees.find(
          (item) => item.personnelNumber === input.personnelNumber,
        );
        if (!person) throw new Error("Mitarbeiter nicht gefunden");
        setActiveId(person.id);
        setDetailOpen(true);
        return {
          id: person.id,
          name: `${person.firstName} ${person.lastName}`,
        };
      },
    });
  }, [employees]);
  useEffect(() => {
    employees
      .flatMap((person) => person.automationRuns ?? [])
      .filter((run) => run.status === "queued")
      .forEach((run) => {
        if (recoveringJobs.current.has(run.jobId)) return;
        recoveringJobs.current.add(run.jobId);
        void collectExecutionResult(run.jobId, () => {
          void refreshEmployees();
        }).finally(() => recoveringJobs.current.delete(run.jobId));
      });
  }, [employees]);

  const active = employees.find((item) => item.id === activeId) ?? employees[0];
  const filtered = employees.filter((item) =>
    `${item.firstName} ${item.lastName} ${item.personnelNumber} ${item.department} ${item.jobTitle}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const activeProcesses = employees.filter(
    (item) => item.status !== "completed",
  );
  const allTasks = employees.flatMap((employee) =>
    employee.tasks.map((task) => ({ ...task, employee })),
  );
  const openTasks = allTasks.filter((item) => item.status !== "done");
  const completion = allTasks.length
    ? Math.round(
        (allTasks.filter((item) => item.status === "done").length /
          allTasks.length) *
          100,
      )
    : 0;

  async function readFile(file: File) {
    setImportError("");
    setDraft(null);
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setImportError("Bitte eine CSV-, XLS- oder XLSX-Datei verwenden.");
      return;
    }
    try {
      let rows: unknown[][];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = new TextDecoder("windows-1252").decode(
          await file.arrayBuffer(),
        );
        rows = text.split(/\r?\n/).map((line) => line.split(";"));
      } else {
        const workbook = read(await file.arrayBuffer(), {
          type: "array",
          cellDates: true,
        });
        rows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
          header: 1,
          raw: false,
          defval: "",
        }) as unknown[][];
      }
      setDraft(parseRows(rows, file.name));
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Die Datei konnte nicht gelesen werden. Unterstützt werden CSV und XLSX.",
      );
    }
  }
  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await response.json().catch(() => ({}))) as ApiMessage;
      if (!response.ok) {
        setImportError(
          data.error || "Der Eintrag konnte nicht gespeichert werden.",
        );
        return;
      }
      const storedId = data.id ?? "";
      await refreshEmployees();
      setActiveId(storedId);
      setImportOpen(false);
      setDetailOpen(true);
    } catch {
      setImportError(
        "Der Server ist nicht erreichbar. Es wurden keine Daten übernommen.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function updateTask(
    employee: EmployeeRecord,
    task: TaskItem,
    status: TaskItem["status"],
  ) {
    const response = await fetch("/api/employees", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeId: employee.id,
        taskId: task.id,
        status,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      setAppError("Die Aufgabe konnte nicht gespeichert werden.");
      return;
    }
    setAppError("");
    await refreshEmployees();
  }
  async function deleteEmployee(person: EmployeeRecord) {
    const response = await fetch("/api/employees", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId: person.id }),
    });
    if (!response.ok) return;
    setEmployees((current) => current.filter((item) => item.id !== person.id));
    setDetailOpen(false);
    setActiveId(employees.find((item) => item.id !== person.id)?.id ?? "");
  }
  async function saveMasterItem(item: MasterDataItem) {
    const response = await fetch("/api/master-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!response.ok) {
      setAppError("Das Stammdatum konnte nicht gespeichert werden.");
      return;
    }
    setMasterData((items) =>
      items.filter((entry) => entry.id !== item.id).concat(item),
    );
  }
  async function deleteMasterItem(id: string) {
    const response = await fetch("/api/master-data", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      setAppError("Das Stammdatum konnte nicht entfernt werden.");
      return;
    }
    setMasterData((items) => items.filter((item) => item.id !== id));
  }

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-[#162033]">
      <Sidebar view={view} />
      <main className="lg:pl-[244px]">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-[#dfe5e8] bg-white/95 px-5 backdrop-blur lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#708090]">
              {viewMeta[view].eyebrow}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {viewMeta[view].title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82909c]" />
              <Input
                aria-label="Mitarbeiter suchen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name oder Personalnummer"
                className="w-[250px] bg-[#f5f7f8] pl-9"
              />
            </div>
            <Button
              onClick={() => {
                setDraft(null);
                setImportError("");
                setImportOpen(true);
              }}
              className="bg-[#176b87] text-white hover:bg-[#12566d]"
            >
              <Upload className="size-4" />
              Datei einlesen
            </Button>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
          {appError && (
            <div className="mb-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {appError}
            </div>
          )}
          {loading ? (
            <Card className="p-8 text-center text-sm text-[#71808c]">
              Daten werden geladen …
            </Card>
          ) : (
            <>
              {view === "overview" && (
                <Overview
                  employees={activeProcesses}
                  allTasks={activeProcesses.flatMap((employee) =>
                    employee.tasks.map((task) => ({ ...task, employee })),
                  )}
                  openTasks={openTasks.filter(
                    (task) => task.employee.status !== "completed",
                  )}
                  completion={completion}
                  active={
                    active?.status === "completed" ? activeProcesses[0] : active
                  }
                  setActive={(person) => {
                    setActiveId(person.id);
                    setDetailOpen(true);
                  }}
                  onTask={updateTask}
                />
              )}
              {view === "people" && (
                <PeopleView
                  employees={filtered}
                  setActive={(person) => {
                    setActiveId(person.id);
                    setDetailOpen(true);
                  }}
                  onDrop={(file) => {
                    setImportOpen(true);
                    readFile(file);
                  }}
                />
              )}
              {view === "tasks" && (
                <TasksView tasks={allTasks} onTask={updateTask} />
              )}
              {view === "automations" && (
                <AutomationsView
                  key={`${active?.id ?? "none"}-${active?.directoryTargetOu ?? ""}-${active?.directoryReferenceUser ?? ""}-${active?.directoryReferenceStatus ?? ""}`}
                  employees={filtered}
                  active={active}
                  setActive={(person) => setActiveId(person.id)}
                  openRecord={() => setDetailOpen(true)}
                  onRefresh={() => void refreshEmployees()}
                  masterData={masterData}
                />
              )}
              {view === "master-data" && (
                <MasterDataView
                  items={masterData}
                  onSave={saveMasterItem}
                  onDelete={deleteMasterItem}
                />
              )}
            </>
          )}
        </div>
      </main>
      <ImportDialog
        open={importOpen}
        setOpen={setImportOpen}
        draft={draft}
        error={importError}
        saving={saving}
        fileRef={fileRef}
        onFile={readFile}
        onSave={saveDraft}
      />
      {active && (
        <EmployeeDialog
          person={active}
          open={detailOpen}
          setOpen={setDetailOpen}
          onTask={updateTask}
          onDelete={deleteEmployee}
          onRefresh={() => void refreshEmployees()}
          masterData={masterData}
        />
      )}
    </div>
  );
}

function Sidebar({ view }: { view: AppView }) {
  const links: Array<{
    view: AppView;
    href: string;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      view: "overview",
      href: "/",
      label: "Übersicht",
      icon: <LayoutDashboard />,
    },
    {
      view: "people",
      href: "/mitarbeiter",
      label: "Mitarbeiterakten",
      icon: <UsersRound />,
    },
    {
      view: "tasks",
      href: "/aufgaben",
      label: "Aufgaben",
      icon: <ListChecks />,
    },
    {
      view: "automations",
      href: "/automationen",
      label: "Automationen",
      icon: <Bot />,
    },
    {
      view: "master-data",
      href: "/stammdaten",
      label: "Stammdaten",
      icon: <Database />,
    },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[244px] flex-col bg-[#132238] text-white lg:flex">
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
        <div className="grid size-10 place-items-center rounded-xl bg-[#5de1d0] text-[#132238]">
          <UserRound className="size-5" />
        </div>
        <div>
          <p className="font-semibold tracking-tight">IT Lifecycle</p>
          <p className="text-xs text-white/55">Kontrollzentrum</p>
        </div>
      </div>
      <nav className="space-y-1 p-4 text-sm">
        {links.map((link) => (
          <a
            key={link.view}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 font-medium [&_svg]:size-4 ${view === link.view ? "bg-white/10 text-white [&_svg]:text-[#5de1d0]" : "text-white/65 hover:bg-white/5"}`}
            href={link.href}
          >
            {link.icon}
            {link.label}
          </a>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-[#5de1d0]" />
            Nachvollziehbarer Betrieb
          </div>
          <p className="text-xs leading-5 text-white/55">
            Testlauf, Ausführung und Rollback werden je Mitarbeiter
            protokolliert.
          </p>
        </div>
        <p className="mt-4 px-1 text-xs text-white/40">Version 1.0</p>
      </div>
    </aside>
  );
}

function Overview({
  employees,
  allTasks,
  openTasks,
  completion,
  active,
  setActive,
  onTask,
}: {
  employees: EmployeeRecord[];
  allTasks: Array<TaskItem & { employee: EmployeeRecord }>;
  openTasks: Array<TaskItem & { employee: EmployeeRecord }>;
  completion: number;
  active?: EmployeeRecord;
  setActive: (person: EmployeeRecord) => void;
  onTask: (
    person: EmployeeRecord,
    task: TaskItem,
    status: TaskItem["status"],
  ) => void;
}) {
  return (
    <>
      <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Mitarbeiterakten"
          value={employees.length}
          icon={<UsersRound />}
          tone="navy"
          detail={`${employees.filter((item) => item.status === "pending").length} in Vorbereitung`}
        />
        <Metric
          label="Offene Aufgaben"
          value={openTasks.length}
          icon={<ListChecks />}
          tone="cyan"
          detail={`${openTasks.filter((item) => item.executionType === "manual").length} manuell`}
        />
        <Metric
          label="Bereit zur Ausführung"
          value={allTasks.filter((item) => item.status === "ready").length}
          icon={<Bot />}
          tone="blue"
          detail="Agent-Aufträge"
        />
        <Metric
          label="Dokumentation"
          value={`${completion}%`}
          icon={<ShieldCheck />}
          tone="green"
          detail="aller Aufgaben abgeschlossen"
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
        <EmployeeTable employees={employees.slice(0, 6)} onOpen={setActive} />
        <Card className="border-[#dce3e7] bg-white p-5">
          <div className="mb-5">
            <h2 className="font-semibold">Nächste Aufgaben</h2>
            <p className="mt-1 text-sm text-[#71808c]">
              Manuell und automatisierbar
            </p>
          </div>
          <TaskList tasks={openTasks.slice(0, 5)} onTask={onTask} />
        </Card>
      </div>
      {active && (
        <Card className="mt-6 border-[#dce3e7] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Aktiver Vorgang</h2>
              <p className="mt-1 text-sm text-[#71808c]">
                {active.firstName} {active.lastName} ·{" "}
                {active.jobTitle || "Stellenbezeichnung fehlt"}
              </p>
            </div>
            <Button variant="outline" onClick={() => setActive(active)}>
              Akte öffnen <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <MiniStat label="Systeme" value={active.services.length} />
            <MiniStat
              label="Offen"
              value={
                active.tasks.filter((item) => item.status !== "done").length
              }
            />
            <MiniStat
              label="Erledigt"
              value={
                active.tasks.filter((item) => item.status === "done").length
              }
            />
          </div>
        </Card>
      )}
    </>
  );
}

function PeopleView({
  employees,
  setActive,
  onDrop,
}: {
  employees: EmployeeRecord[];
  setActive: (person: EmployeeRecord) => void;
  onDrop: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-6">
      <button
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onDrop(file);
        }}
        className={`flex w-full items-center justify-between rounded-2xl border-2 border-dashed p-5 text-left transition ${dragging ? "border-[#176b87] bg-[#eaf6f7]" : "border-[#bfd0d8] bg-white hover:border-[#176b87]"}`}
      >
        <span>
          <span className="font-medium">HR-Laufkarte hier ablegen</span>
          <span className="mt-1 block text-sm text-[#71808b]">
            CSV, XLS oder XLSX. Die Datei wird erst geprüft und danach angelegt.
          </span>
        </span>
        <Upload className="size-6 text-[#176b87]" />
      </button>
      <EmployeeTable employees={employees} onOpen={setActive} full />
    </div>
  );
}
function TasksView({
  tasks,
  onTask,
}: {
  tasks: Array<TaskItem & { employee: EmployeeRecord }>;
  onTask: (
    person: EmployeeRecord,
    task: TaskItem,
    status: TaskItem["status"],
  ) => void;
}) {
  return (
    <Card className="border-[#dce3e7] bg-white p-5">
      <div className="mb-5">
        <h2 className="font-semibold">Alle Aufgaben</h2>
        <p className="mt-1 text-sm text-[#71808c]">
          Manuelle und automatisierbare Schritte aus allen Vorgängen
        </p>
      </div>
      <TaskList tasks={tasks} onTask={onTask} />
    </Card>
  );
}

function AdCredentialDialog({
  open,
  setOpen,
  title,
  onSubmit,
  requireAdCredential = true,
  requireInitialPassword = false,
  requireHelpdeskCredential = false,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  title: string;
  onSubmit: (
    credential?: AdCredential,
    initialPassword?: string,
    helpdeskCredential?: AdCredential,
  ) => void;
  requireAdCredential?: boolean;
  requireInitialPassword?: boolean;
  requireHelpdeskCredential?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [helpdeskUsername, setHelpdeskUsername] = useState("");
  const [helpdeskPassword, setHelpdeskPassword] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      (requireAdCredential && (!username.trim() || !password)) ||
      (requireInitialPassword && !initialPassword) ||
      (requireHelpdeskCredential &&
        (!helpdeskUsername.trim() || !helpdeskPassword))
    )
      return;
    onSubmit(
      requireAdCredential ? { username: username.trim(), password } : undefined,
      requireInitialPassword ? initialPassword : undefined,
      requireHelpdeskCredential
        ? {
            username: helpdeskUsername.trim(),
            password: helpdeskPassword,
          }
        : undefined,
    );
    setPassword("");
    setInitialPassword("");
    setHelpdeskPassword("");
    setOpen(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassword("");
          setInitialPassword("");
          setHelpdeskPassword("");
        }
        setOpen(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Die Zugangsdaten gelten nur für diesen Auftrag. Sie werden weder
              in der Mitarbeiterakte noch im Ausführungsverlauf gespeichert.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {requireAdCredential && (
              <>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    htmlFor="ad-username"
                  >
                    AD-Benutzername
                  </label>
                  <Input
                    id="ad-username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="KAUTH\\benutzername"
                    autoFocus
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    htmlFor="ad-password"
                  >
                    AD-Kennwort
                  </label>
                  <Input
                    id="ad-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </>
            )}
            {requireInitialPassword && (
              <div className="rounded-xl border border-[#dce3e7] bg-[#f8fafb] p-4">
                <label
                  className="mb-1.5 block text-sm font-medium"
                  htmlFor="initial-user-password"
                >
                  Initiales Kennwort für den Mitarbeiter
                </label>
                <Input
                  id="initial-user-password"
                  type="password"
                  autoComplete="new-password"
                  value={initialPassword}
                  onChange={(event) => setInitialPassword(event.target.value)}
                />
                <p className="mt-2 text-xs leading-5 text-[#71808c]">
                  Damit wird das Konto aktiviert. Der Mitarbeiter muss das
                  Kennwort bei der ersten Anmeldung ändern. Das Kennwort wird
                  nicht gespeichert.
                </p>
              </div>
            )}
            {requireHelpdeskCredential && (
              <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <div>
                  <p className="text-sm font-medium text-sky-950">
                    Windows-Anmeldung für i-net HelpDesk
                  </p>
                  <p className="mt-1 text-xs leading-5 text-sky-800">
                    Hier das normale Domänenkonto mit HelpDesk-Rechten
                    eintragen. Es wird nur für die Ticketerstellung verwendet.
                  </p>
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    htmlFor="helpdesk-username"
                  >
                    HelpDesk-Benutzername
                  </label>
                  <Input
                    id="helpdesk-username"
                    autoComplete="off"
                    autoFocus={!requireAdCredential}
                    value={helpdeskUsername}
                    onChange={(event) =>
                      setHelpdeskUsername(event.target.value)
                    }
                    placeholder="KAUTH\\vinzent.niederwieser"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    htmlFor="helpdesk-password"
                  >
                    HelpDesk-Kennwort
                  </label>
                  <Input
                    id="helpdesk-password"
                    type="password"
                    autoComplete="off"
                    value={helpdeskPassword}
                    onChange={(event) =>
                      setHelpdeskPassword(event.target.value)
                    }
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>
                {requireAdCredential
                  ? "Für den Regelbetrieb ein delegiertes AD-Konto verwenden. "
                  : "Für diese Wiederholung werden keine AD-Zugangsdaten benötigt. "}
                Die lokale Installation sollte vor echtem Betrieb per HTTPS
                erreichbar sein.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={
                (requireAdCredential && (!username.trim() || !password)) ||
                (requireInitialPassword && !initialPassword) ||
                (requireHelpdeskCredential &&
                  (!helpdeskUsername.trim() || !helpdeskPassword))
              }
              className="bg-[#176b87] text-white hover:bg-[#12566d]"
            >
              Auftrag starten
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AutomationsView({
  employees,
  active,
  setActive,
  openRecord,
  onRefresh,
  masterData,
}: {
  employees: EmployeeRecord[];
  active?: EmployeeRecord;
  setActive: (person: EmployeeRecord) => void;
  openRecord: () => void;
  onRefresh: () => void;
  masterData: MasterDataItem[];
}) {
  const [result, setResult] = useState("");
  const [latestExecution, setLatestExecution] =
    useState<ImmediateExecutionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [liveProgress, setLiveProgress] =
    useState<RunningExecutionProgress | null>(null);
  const [targetOu, setTargetOu] = useState(active?.directoryTargetOu ?? "");
  const [referenceUser, setReferenceUser] = useState(
    active ? getReferenceUserName(active) : "",
  );
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [credentialAction, setCredentialAction] = useState<
    "reference" | "WhatIf" | "Execute"
  >("WhatIf");
  const [computerAssignments, setComputerAssignments] =
    useState<ComputerAssignments>({});
  const job = active
    ? buildAutomationJob(active, computerAssignments, automationOptions(masterData))
    : null;
  const invalidExistingComputer =
    job?.directory.computers.find(
      (computer) =>
        computer.mode === "existing" &&
        !/^[A-Z0-9-]{1,15}$/.test(computer.existingName ?? ""),
    ) ?? null;
  useEffect(() => {
    if (result)
      window.setTimeout(
        () =>
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          }),
        0,
      );
  }, [result]);
  async function saveTargetOu() {
    if (!active) return;
    const response = await fetch("/api/employees", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeId: active.id,
        directoryTargetOu: targetOu,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as ApiMessage;
    if (!response.ok) {
      setResult(data.error || "Die Ziel-OU konnte nicht gespeichert werden.");
      return;
    }
    setResult("AD-Ziel-OU wurde gespeichert.");
    onRefresh();
  }
  async function requestRun(
    mode: "WhatIf" | "Execute",
    adCredential: AdCredential,
    initialPassword?: string,
    helpdeskCredential?: AdCredential,
  ) {
    if (!job) return;
    if (invalidExistingComputer) {
      setResult(
        `Bitte für ${invalidExistingComputer.type} einen gültigen AD-Computernamen mit maximal 15 Zeichen eingeben.`,
      );
      return;
    }
    if (mode === "Execute" && job.directory.targetOu === "REVIEW_REQUIRED") {
      setResult(
        "Vor der echten Ausführung muss eine AD-Ziel-OU eingetragen werden.",
      );
      return;
    }
    setRunning(true);
    setResult("");
    setLatestExecution(null);
    setLiveProgress(null);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...job,
          requestedMode: mode,
          adCredential,
          ...(initialPassword ? { initialPassword } : {}),
          ...(helpdeskCredential ? { helpdeskCredential } : {}),
        }),
      });
      const data = (await response.json()) as ApiMessage;
      if (!response.ok)
        setResult(data.error ?? "Management-Agent nicht erreichbar.");
      else {
        const acceptedJobId = data.jobId ?? job.jobId;
        setResult(
          `${mode === "Execute" ? "Ausführung" : "Testlauf"} ${acceptedJobId} wurde angenommen. Ergebnis wird abgerufen …`,
        );
        setResult(
          await collectExecutionResult(
            acceptedJobId,
            onRefresh,
            setLatestExecution,
            setResult,
            setLiveProgress,
          ),
        );
      }
    } catch {
      setResult("Management-Agent nicht erreichbar.");
    } finally {
      setRunning(false);
      setLiveProgress(null);
    }
  }
  async function checkReference(adCredential: AdCredential) {
    if (!active || !referenceUser.trim()) {
      setResult("Bitte einen Referenzbenutzer eingeben.");
      return;
    }
    setRunning(true);
    setResult("");
    try {
      const response = await fetch("/api/reference-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: active.id,
          referenceUser: referenceUser.trim(),
          adCredential,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiMessage;
      if (!response.ok) {
        setResult(
          data.error ?? "Die Referenzprüfung konnte nicht gestartet werden.",
        );
        return;
      }
      setResult("Referenzprüfung wurde gestartet. Ergebnis wird abgerufen …");
      setResult(await collectExecutionResult(data.jobId ?? "", onRefresh));
    } catch {
      setResult("Management-Agent nicht erreichbar.");
    } finally {
      setRunning(false);
    }
  }
  function askForCredentials(action: "reference" | "WhatIf" | "Execute") {
    setCredentialAction(action);
    setCredentialOpen(true);
  }
  function submitCredentials(
    credential?: AdCredential,
    initialPassword?: string,
    helpdeskCredential?: AdCredential,
  ) {
    if (!credential) return;
    if (credentialAction === "reference") void checkReference(credential);
    else
      void requestRun(
        credentialAction,
        credential,
        initialPassword,
        helpdeskCredential,
      );
  }
  function selectEmployee(person: EmployeeRecord) {
    setComputerAssignments({});
    setTargetOu(person.directoryTargetOu ?? "");
    setReferenceUser(getReferenceUserName(person));
    setResult("");
    setLatestExecution(null);
    setLiveProgress(null);
    setActive(person);
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <AdCredentialDialog
        open={credentialOpen}
        setOpen={setCredentialOpen}
        title={
          credentialAction === "reference"
            ? "Referenzbenutzer im AD prüfen"
            : credentialAction === "WhatIf"
              ? "AD-Testlauf starten"
              : "AD-Automation ausführen"
        }
        requireInitialPassword={
          credentialAction === "Execute" &&
          job?.lifecycleType !== "offboarding" &&
          Boolean(job?.actions.some((action) => action.type === "CreateAdUser"))
        }
        requireHelpdeskCredential={
          credentialAction === "Execute" &&
          Boolean(
            job?.actions.some(
              (action) => action.type === "CreateHelpdeskTicket",
            ),
          )
        }
        onSubmit={submitCredentials}
      />
      <Card className="border-[#dce3e7] bg-white p-4">
        <p className="mb-3 text-sm font-medium">Mitarbeiter auswählen</p>
        <div className="space-y-2">
          {employees.map((person) => (
            <button
              key={person.id}
              onClick={() => selectEmployee(person)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${active?.id === person.id ? "border-[#176b87] bg-[#eef7f8]" : "border-[#e3e8eb] hover:bg-[#f7f9fa]"}`}
            >
              <span className="grid size-9 place-items-center rounded-full bg-[#e7f4f5] text-xs font-semibold text-[#176b87]">
                {initials(person)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {person.firstName} {person.lastName}
                </span>
                <span className="block truncate text-xs text-[#78858f]">
                  {person.jobTitle || "Keine Stellenbezeichnung"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      {active && job && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <IntegrationCard
              icon={<Server />}
              title="Active Directory"
              value={job.directory.domain}
              detail={job.directory.userPrincipalName}
              status="Vorschau"
            />
            <IntegrationCard
              icon={<TicketCheck />}
              title="i-net HelpDesk"
              value="API-Auftrag"
              detail={job.helpdesk.subject}
              status="Vorbereitet"
            />
            <IntegrationCard
              icon={<Mail />}
              title="Microsoft 365"
              value={job.actions.some((action) => action.type === "ProvisionM365Mailbox") ? "Postfach geplant" : "Nicht angefordert"}
              detail="AD-Sync · SPB-Lizenz · Exchange Online"
              status={job.actions.some((action) => action.type === "ProvisionM365Mailbox") ? "Automatisch" : "Übersprungen"}
            />
            <IntegrationCard
              icon={<KeyRound />}
              title="Anmeldedaten"
              value="Pro Auftrag"
              detail="Werden nicht gespeichert"
              status="Temporär"
            />
          </div>
          {job.lifecycleType !== "offboarding" && (
            <Card className="border-[#dce3e7] bg-white p-5">
              <p className="font-medium">Referenzbenutzer prüfen</p>
              <p className="mt-1 text-sm text-[#71808c]">
                Der Agent prüft den Benutzer im AD und übernimmt dessen
                Benutzer-OU als Ziel.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={referenceUser}
                  onChange={(event) => setReferenceUser(event.target.value)}
                  placeholder="z. B. laura.romankewicz oder L. Romankewicz"
                />
                <Button
                  variant="outline"
                  disabled={running || !referenceUser.trim()}
                  onClick={() => askForCredentials("reference")}
                >
                  <Search className="size-4" />
                  Erneut prüfen
                </Button>
              </div>
              <p
                className={`mt-3 text-sm ${active.directoryReferenceStatus === "found" ? "text-emerald-700" : active.directoryReferenceStatus === "not_found" || active.directoryReferenceStatus === "ambiguous" || active.directoryReferenceStatus === "error" ? "text-rose-700" : "text-[#71808c]"}`}
              >
                {active.directoryReferenceMessage ||
                  (referenceUser
                    ? "Noch nicht geprüft"
                    : "Kein Referenzbenutzer in der Laufkarte erkannt")}
              </p>
              {active.directoryReferenceStatus === "found" &&
                active.directoryTargetOu && (
                  <p className="mt-1 break-all font-mono text-xs text-[#667680]">
                    Ziel-OU: {active.directoryTargetOu}
                  </p>
                )}
            </Card>
          )}
          {job.lifecycleType !== "offboarding" && (
            <Card className="border-[#dce3e7] bg-white p-5">
              <p className="font-medium">AD-Ziel-OU</p>
              <p className="mt-1 text-sm text-[#71808c]">
                Ohne Referenzbenutzer muss die Benutzer-OU vor der echten
                Ausführung bestätigt werden.
              </p>
              <div className="mt-4 flex gap-2">
                <Input
                  value={targetOu}
                  onChange={(event) => setTargetOu(event.target.value)}
                  placeholder="OU=Benutzer,OU=Denkingen,DC=kauth,DC=local"
                />
                <Button variant="outline" onClick={saveTargetOu}>
                  Speichern
                </Button>
              </div>
            </Card>
          )}
          {job.directory.computers.length > 0 && (
            <Card className="border-[#dce3e7] bg-white p-5">
              <p className="font-medium">Computer zuordnen</p>
              <p className="mt-1 text-sm leading-6 text-[#71808c]">
                Standardmäßig wird der nächste freie Rechnername angelegt. Bei
                der Übernahme eines vorhandenen Rechners ändert der Agent nur
                dessen Beschreibung auf „
                {job.person.department || "Keine Abteilung"} /{" "}
                {job.person.displayName}“.
              </p>
              <div className="mt-4 space-y-4">
                {job.directory.computers.map((computer) => (
                  <div
                    key={computer.type}
                    className="rounded-xl border border-[#e1e7ea] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{computer.type}</p>
                        <p className="mt-1 text-xs text-[#71808c]">
                          {computer.mode === "new"
                            ? `Neuanlage nach Schema ${computer.prefix}xxx`
                            : "Bestehendes AD-Computerobjekt; nur Beschreibung ändern"}
                        </p>
                      </div>
                      <div className="flex rounded-lg border border-[#dce3e7] p-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            computer.mode === "new" ? "default" : "ghost"
                          }
                          onClick={() =>
                            setComputerAssignments((current) => ({
                              ...current,
                              [computer.type]: { mode: "new" },
                            }))
                          }
                        >
                          Neu anlegen
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            computer.mode === "existing" ? "default" : "ghost"
                          }
                          onClick={() =>
                            setComputerAssignments((current) => ({
                              ...current,
                              [computer.type]: {
                                mode: "existing",
                                existingName:
                                  current[computer.type]?.existingName ?? "",
                              },
                            }))
                          }
                        >
                          Vorhandenen übernehmen
                        </Button>
                      </div>
                    </div>
                    {computer.mode === "existing" && (
                      <div className="mt-3">
                        <Input
                          value={computer.existingName ?? ""}
                          maxLength={15}
                          onChange={(event) =>
                            setComputerAssignments((current) => ({
                              ...current,
                              [computer.type]: {
                                mode: "existing",
                                existingName: event.target.value.toUpperCase(),
                              },
                            }))
                          }
                          placeholder={`z. B. ${computer.prefix}042`}
                          className={
                            computer.existingName &&
                            !/^[A-Z0-9-]{1,15}$/.test(computer.existingName)
                              ? "border-rose-400"
                              : ""
                          }
                        />
                        <p className="mt-2 text-xs text-[#71808c]">
                          Name, OU, Gruppen, Status und „Verwaltet von“ bleiben
                          unverändert. Der alte Beschreibungstext wird für den
                          Rollback protokolliert.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card className="border-[#dce3e7] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Ausführungsvorschau</h2>
                <p className="mt-1 text-sm text-[#71808c]">
                  {job.actions.length} bestätigungspflichtige Aktionen
                </p>
              </div>
              <Button variant="outline" onClick={openRecord}>
                Akte öffnen
              </Button>
            </div>
            <div className="mt-5 space-y-2">
              {job.actions.map((action) => (
                <div
                  key={`${action.type}-${action.target}`}
                  className="flex items-center gap-3 rounded-xl border border-[#e1e7ea] px-4 py-3"
                >
                  <Check className="size-4 text-[#176b87]" />
                  <span className="text-sm font-medium">{executionActionLabel(action.type)}</span>
                  <span className="ml-auto max-w-[50%] truncate text-xs text-[#78858f]">
                    {action.target}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden border-[#263a54] bg-[#132238] text-white">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileCode2 className="size-4 text-[#5de1d0]" />
                <h2 className="font-medium">Auszuführendes Skript</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() =>
                  downloadText(
                    `${job.jobId}.ps1`,
                    buildPowerShellPreview(active, job),
                    "text/plain",
                  )
                }
              >
                <Download className="size-4" />
                Speichern
              </Button>
            </div>
            <pre className="max-h-80 overflow-auto p-5 text-sm leading-6 text-[#c8d7e5]">
              {buildPowerShellPreview(active, job)}
            </pre>
          </Card>
          <Card className="border-[#dce3e7] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">Auf dem Windows-Jobserver starten</p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#71808c]">
                  Testlauf und echte Ausführung erzeugen einen nachvollziehbaren
                  Ergebnisdatensatz. AD-Zugangsdaten werden nur für den
                  jeweiligen Auftrag verwendet und nicht gespeichert.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => downloadJob(job)}>
                  <Download className="size-4" />
                  Auftrag
                </Button>
                <Button
                  variant="outline"
                  disabled={running || !!invalidExistingComputer}
                  onClick={() => askForCredentials("WhatIf")}
                >
                  <Bot className="size-4" />
                  WhatIf
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={
                        running ||
                        job.directory.targetOu === "REVIEW_REQUIRED" ||
                        !!invalidExistingComputer ||
                        (!!job.directory.referenceUser &&
                          active.directoryReferenceStatus !== "found")
                      }
                      className="bg-[#176b87] text-white hover:bg-[#12566d]"
                    >
                      <ShieldCheck className="size-4" />
                      Echt ausführen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Automation wirklich ausführen?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Der Agent verändert Active Directory und erstellt das
                        Helpdesk-Ticket. Jede tatsächliche Änderung wird für den
                        späteren Rollback protokolliert.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => askForCredentials("Execute")}
                      >
                        Ausführung starten
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {result && (
              <div
                className={`mt-4 rounded-xl border p-3 text-sm ${result.includes("gespeichert") || result.includes("angenommen") ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
              >
                {result}
              </div>
            )}
            {running && liveProgress && (
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sky-950">
                      Live-Status des Management-Agenten
                    </p>
                    <p className="mt-1 text-sm text-sky-800">
                      {liveProgress.currentAction
                        ? executionActionLabel(liveProgress.currentAction)
                        : "Auftrag wird bearbeitet"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-sky-200 bg-white text-sky-700"
                  >
                    Läuft
                  </Badge>
                </div>
                <ExecutionLog entries={liveProgress.log ?? []} />
              </div>
            )}
            {latestExecution &&
              latestExecution.operation !== "reference_check" && (
                <div className="mt-4 rounded-xl border border-[#dce3e7] bg-[#f8fafb] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        Ergebnis des letzten{" "}
                        {latestExecution.mode === "WhatIf"
                          ? "Testlaufs"
                          : "Laufs"}
                      </p>
                      <p className="mt-1 text-sm text-[#71808c]">
                        Direktansicht – das Ergebnis bleibt zusätzlich in der
                        Mitarbeiterakte gespeichert.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={badgeClass(latestExecution.status ?? "")}
                    >
                      {statusText[latestExecution.status ?? ""] ??
                        latestExecution.status ??
                        "Ergebnis"}
                    </Badge>
                  </div>
                  {latestExecution.error && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      {latestExecution.error}
                    </div>
                  )}
                  <div className="mt-4">
                    <ChangeList changes={latestExecution.changes} />
                  </div>
                  <ExecutionLog entries={latestExecution.log ?? []} />
                </div>
              )}
          </Card>
        </div>
      )}
    </div>
  );
}

function ExecutionLog({ entries }: { entries: ExecutionLogEntry[] }) {
  if (!entries.length) return null;
  const stateLabel: Record<string, string> = {
    running: "Läuft",
    completed: "Erledigt",
    simulated: "Testlauf",
    skipped: "Übersprungen",
    failed: "Fehler",
    found: "Gefunden",
    not_found: "Nicht gefunden",
    ambiguous: "Mehrdeutig",
  };
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-[#dce3e7] bg-white">
      <div className="border-b border-[#e5eaed] px-3 py-2 text-sm font-medium">
        Ablaufprotokoll
      </div>
      <div className="max-h-72 divide-y overflow-y-auto">
        {entries.map((entry, index) => (
          <div
            key={`${entry.time}-${entry.action}-${index}`}
            className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[5rem_minmax(9rem,.7fr)_minmax(0,1fr)]"
          >
            <span className="text-xs text-[#71808c]">
              {entry.time
                ? new Intl.DateTimeFormat("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(new Date(entry.time))
                : "—"}
            </span>
            <span className="font-medium">
              {executionActionLabel(entry.action)}
              <span className="ml-2 text-xs font-normal text-[#71808c]">
                {stateLabel[entry.state] ?? entry.state}
              </span>
            </span>
            <span className="break-words text-[#52626e]">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MasterDataView({
  items,
  onSave,
  onDelete,
}: {
  items: MasterDataItem[];
  onSave: (item: MasterDataItem) => void;
  onDelete: (id: string) => void;
}) {
  const [kind, setKind] = useState<MasterDataKind>("group");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [owner, setOwner] = useState("IT");
  const visible = items.filter((item) => item.kind === kind);
  function add() {
    if (!label.trim()) return;
    onSave({
      id: `${kind}-${Date.now()}`,
      kind,
      label: label.trim(),
      value: value.trim(),
      owner: owner.trim() || "IT",
      active: true,
    });
    setLabel("");
    setValue("");
  }
  return (
    <Tabs
      value={kind}
      onValueChange={(next) => setKind(next as MasterDataKind)}
    >
      <TabsList className="mb-5">
        <TabsTrigger value="group">Gruppen</TabsTrigger>
        <TabsTrigger value="application">Anwendungen</TabsTrigger>
        <TabsTrigger value="task">Aufgaben</TabsTrigger>
        <TabsTrigger value="ou">OU-Zuordnung</TabsTrigger>
        <TabsTrigger value="helpdesk">HelpDesk</TabsTrigger>
      </TabsList>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
        <Card className="overflow-hidden border-[#dce3e7] bg-white">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">{kindText[kind]}</h2>
            <p className="mt-1 text-sm text-[#71808c]">
              Diese Werte steuern Vorschläge und Automationsaufträge.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bezeichnung</TableHead>
                <TableHead>Technischer Wert</TableHead>
                <TableHead>Verantwortlich</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.value || "—"}
                  </TableCell>
                  <TableCell>{item.owner}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(item.id)}
                      aria-label={`${item.label} entfernen`}
                    >
                      <Trash2 className="size-4 text-rose-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!visible.length && (
            <p className="p-8 text-center text-sm text-[#71808c]">
              Noch keine Einträge vorhanden.
            </p>
          )}
        </Card>
        <Card className="h-fit border-[#dce3e7] bg-white p-5">
          <h2 className="font-semibold">Eintrag hinzufügen</h2>
          <div className="mt-4 space-y-3">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bezeichnung"
            />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                kind === "ou"
                  ? "Distinguished Name"
                  : kind === "helpdesk"
                    ? "Ressourcenname oder GUID"
                    : "Technischer Wert"
              }
            />
            <Input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Verantwortlich"
            />
            <Button
              onClick={add}
              className="w-full bg-[#176b87] text-white hover:bg-[#12566d]"
            >
              <Plus className="size-4" />
              Hinzufügen
            </Button>
          </div>
        </Card>
      </div>
    </Tabs>
  );
}

function EmployeeTable({
  employees,
  onOpen,
  full = false,
}: {
  employees: EmployeeRecord[];
  onOpen: (person: EmployeeRecord) => void;
  full?: boolean;
}) {
  return (
    <Card className="overflow-hidden border-[#dce3e7] bg-white shadow-[0_8px_30px_rgba(27,45,63,.05)]">
      <div className="flex items-center justify-between border-b border-[#e5eaed] px-5 py-4">
        <div>
          <h2 className="font-semibold">
            {full ? "Mitarbeiterakten" : "Aktuelle Vorgänge"}
          </h2>
          <p className="mt-0.5 text-sm text-[#71808c]">
            Importierte On- und Offboardings
          </p>
        </div>
        <Badge variant="outline" className="rounded-full px-3">
          {employees.length} Einträge
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f7f9fa]">
            <TableHead>Mitarbeiter</TableHead>
            <TableHead className="hidden md:table-cell">
              Stellenbezeichnung
            </TableHead>
            <TableHead className="hidden sm:table-cell">Termin</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((person) => {
            const event = person.events[0];
            return (
              <TableRow
                key={person.id}
                className="cursor-pointer"
                onClick={() => onOpen(person)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e7f4f5] text-sm font-semibold text-[#176b87]">
                      {initials(person)}
                    </div>
                    <div>
                      <p className="font-medium">
                        {person.firstName} {person.lastName}
                      </p>
                      <p className="text-xs text-[#7a8790]">
                        #{person.personnelNumber} ·{" "}
                        {person.department || "Keine Abteilung"}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {person.jobTitle || (
                    <span className="text-amber-700">Nicht erkannt</span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatDate(
                    event?.type === "offboarding"
                      ? person.endDate
                      : person.startDate,
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={badgeClass(person.status)}
                  >
                    {statusText[person.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ChevronRight className="size-4 text-[#82909c]" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!employees.length && (
        <div className="p-8 text-center text-sm text-[#71808c]">
          Keine offenen Vorgänge. Abgeschlossene Akten bleiben unter
          „Mitarbeiterakten“ erhalten.
        </div>
      )}
    </Card>
  );
}
function TaskList({
  tasks,
  onTask,
}: {
  tasks: Array<TaskItem & { employee: EmployeeRecord }>;
  onTask: (
    person: EmployeeRecord,
    task: TaskItem,
    status: TaskItem["status"],
  ) => void;
}) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div
          key={`${task.employee.id}-${task.id}`}
          className="flex items-start gap-3 rounded-xl border border-[#e4eaed] bg-white p-3.5"
        >
          <Checkbox
            aria-label={`${task.title} erledigen`}
            checked={task.status === "done"}
            onCheckedChange={(checked) =>
              onTask(task.employee, task, checked ? "done" : "open")
            }
            className="mt-0.5 data-[state=checked]:border-[#176b87] data-[state=checked]:bg-[#176b87]"
          />
          <div className="min-w-0 flex-1">
            <p
              className={
                task.status === "done"
                  ? "text-sm font-medium text-[#7a8790] line-through"
                  : "text-sm font-medium leading-5"
              }
            >
              {task.title}
            </p>
            <p className="mt-1 truncate text-xs text-[#7b8891]">
              {task.employee.firstName} {task.employee.lastName} · {task.owner}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              task.executionType === "simulated"
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }
          >
            {task.executionType === "simulated" ? "Agent" : "Manuell"}
          </Badge>
        </div>
      ))}
    </div>
  );
}
function Metric({
  label,
  value,
  icon,
  tone,
  detail,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: string;
  detail: string;
}) {
  const colors: Record<string, string> = {
    navy: "bg-[#132238] text-white",
    cyan: "bg-[#e6f7f5] text-[#176b87]",
    blue: "bg-[#eaf2f8] text-[#21648a]",
    green: "bg-[#eaf6ef] text-[#24724b]",
  };
  return (
    <Card className="border-[#dce3e7] bg-white p-5">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-sm text-[#6d7c87]">{label}</p>
        <div
          className={`grid size-9 place-items-center rounded-xl [&>svg]:size-4 ${colors[tone]}`}
        >
          {icon}
        </div>
      </div>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[#7b8992]">{detail}</p>
    </Card>
  );
}
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#f3f6f8] p-4">
      <p className="text-xs text-[#73818b]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
function IntegrationCard({
  icon,
  title,
  value,
  detail,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  status: string;
}) {
  return (
    <Card className="border-[#dce3e7] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-[#e7f4f5] text-[#176b87] [&>svg]:size-5">
          {icon}
        </div>
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-700"
        >
          {status}
        </Badge>
      </div>
      <p className="mt-4 text-sm text-[#6d7c87]">{title}</p>
      <p className="mt-1 font-semibold">{value}</p>
      <p className="mt-2 truncate text-sm text-[#78858f]">{detail}</p>
    </Card>
  );
}

function ImportDialog({
  open,
  setOpen,
  draft,
  error,
  saving,
  fileRef,
  onFile,
  onSave,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  draft: EmployeeRecord | null;
  error: string;
  saving: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  onSave: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Datei einlesen</DialogTitle>
          <DialogDescription>
            Nur ausgewählte Zeilen mit Verantwortlichkeit IT werden übernommen.
            Habel ist die festgelegte Ausnahme.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(event) =>
            event.target.files?.[0] && onFile(event.target.files[0])
          }
        />
        {!draft && (
          <button
            onClick={() => fileRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) onFile(file);
            }}
            className={`grid min-h-56 w-full place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition ${dragging ? "border-[#176b87] bg-[#eaf6f7]" : "border-[#bfd0d8] bg-[#f6f9fa] hover:border-[#176b87]"}`}
          >
            <span>
              <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-white text-[#176b87] shadow-sm">
                <FileSpreadsheet className="size-6" />
              </span>
              <span className="block font-medium">
                Datei auswählen oder hier ablegen
              </span>
              <span className="mt-1 block text-sm text-[#71808b]">
                CSV, XLS oder XLSX
              </span>
            </span>
          </button>
        )}
        {error && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        {draft && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#dce5e8] bg-[#f6f9fa] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#70808c]">Erkannter Vorgang</p>
                  <p className="text-lg font-semibold">
                    {draft.events[0].type === "onboarding"
                      ? "Onboarding"
                      : "Offboarding"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  Datei gelesen
                </Badge>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <Info
                  label="Mitarbeiter"
                  value={`${draft.firstName} ${draft.lastName}`}
                />
                <Info label="Personalnummer" value={draft.personnelNumber} />
                <Info
                  label="Abteilung"
                  value={draft.department || "Nicht angegeben"}
                />
                <Info
                  label="Stellenbezeichnung"
                  value={draft.jobTitle || "Nicht erkannt"}
                />
                <Info
                  label="Termin"
                  value={formatDate(
                    draft.events[0].type === "offboarding"
                      ? draft.endDate
                      : draft.startDate,
                  )}
                />
                <Info
                  label="IT-relevante Elemente"
                  value={String(draft.services.length)}
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Übernommene Elemente</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {draft.services.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <Check className="size-4 text-emerald-600" />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              ConSense, Tisoware und Teamskanäle anderer Fachbereiche werden
              nicht übernommen.
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          {draft && (
            <Button
              disabled={saving}
              onClick={onSave}
              className="bg-[#176b87] text-white hover:bg-[#12566d]"
            >
              {saving ? "Wird angelegt …" : "Eintrag anlegen"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDialog({
  person,
  open,
  setOpen,
  onTask,
  onDelete,
  onRefresh,
  masterData,
}: {
  person: EmployeeRecord;
  open: boolean;
  setOpen: (value: boolean) => void;
  onTask: (
    person: EmployeeRecord,
    task: TaskItem,
    status: TaskItem["status"],
  ) => void;
  onDelete: (person: EmployeeRecord) => void;
  onRefresh: () => void;
  masterData: MasterDataItem[];
}) {
  const job = buildAutomationJob(person, {}, automationOptions(masterData));
  const statusUrl = person.shareToken && typeof window !== "undefined"
    ? `${window.location.origin}/status/${person.shareToken}`
    : "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
        <div className="bg-[#132238] p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-[#5de1d0] text-lg font-semibold text-[#132238]">
              {initials(person)}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl">
                  {person.firstName} {person.lastName}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="border-white/15 bg-white/10 text-white"
                >
                  {statusText[person.status]}
                </Badge>
              </div>
              <DialogDescription className="mt-1 text-white/55">
                #{person.personnelNumber} · {person.department} ·{" "}
                {person.jobTitle || "Keine Stellenbezeichnung"}
              </DialogDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label="Mitarbeiter löschen"
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mitarbeiterakte löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Die Akte von {person.firstName} {person.lastName} sowie
                    Aufgaben, Systeme und Historie werden dauerhaft entfernt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => onDelete(person)}
                  >
                    Akte löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <Tabs defaultValue="inventory" className="p-6">
          <TabsList variant="line" className="mb-5 flex-wrap">
            <TabsTrigger value="inventory">
              <Boxes />
              Ausstattung
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <ListChecks />
              Aufgaben
            </TabsTrigger>
            <TabsTrigger value="automation">
              <Bot />
              Automation
            </TabsTrigger>
            <TabsTrigger value="history">
              <Activity />
              Historie
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inventory">
            {statusUrl && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#bcdde1] bg-[#eef7f8] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-[#12566d]">Freigegebene Statusansicht</p>
                  <p className="mt-1 text-sm text-[#56727b]">Der Link zeigt Aufgaben, Zugänge und Fortschritt – ohne kritische IT-Aktionen.</p>
                </div>
                <a href={statusUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#8cc8cf] bg-white px-3 text-sm font-medium text-[#12566d] hover:bg-[#f8ffff]">
                  <Link2 className="size-4" />Vorschau öffnen
                </a>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {person.services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-xl border border-[#dfe6e9] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{service.label}</p>
                      <p className="mt-1 text-xs text-[#78858f]">
                        {service.category} · {service.source}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={badgeClass(service.status)}
                    >
                      {statusText[service.status] || service.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="tasks">
            <TaskList
              tasks={person.tasks.map((task) => ({
                ...task,
                employee: person,
              }))}
              onTask={onTask}
            />
          </TabsContent>
          <TabsContent value="automation">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#78858f]">
                  Active Directory
                </p>
                <div className="mt-3 space-y-3 text-sm">
                  <Info
                    label="Anmeldename"
                    value={job.directory.samAccountName}
                  />
                  <Info
                    label="E-Mail / UPN"
                    value={job.directory.userPrincipalName}
                  />
                  <Info
                    label="Ziel-OU"
                    value={
                      job.directory.targetOu === "REVIEW_REQUIRED"
                        ? "Muss gewählt werden"
                        : job.directory.targetOu === "REFERENCE_USER_OU"
                          ? "OU des Referenzbenutzers"
                          : job.directory.targetOu
                    }
                  />
                </div>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#78858f]">
                  Gruppenvorschläge
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {job.directory.suggestedGroups.map((group) => (
                    <Badge key={group} variant="outline">
                      {group}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-2">
                <pre className="overflow-auto rounded-xl bg-[#132238] p-4 text-sm leading-6 text-[#c8d7e5]">
                  {buildPowerShellPreview(person)}
                </pre>
              </div>
              <div className="lg:col-span-2">
                <ExecutionHistory
                  person={person}
                  runs={person.automationRuns ?? []}
                  onRefresh={onRefresh}
                  masterData={masterData}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="history">
            <div className="space-y-4 border-l border-[#ccd8dd] pl-5">
              {person.events.map((event) => (
                <div key={event.id} className="relative">
                  <span className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-[#176b87] ring-4 ring-white" />
                  <p className="font-medium">
                    {event.type === "onboarding"
                      ? "Onboarding importiert"
                      : event.type === "offboarding"
                        ? "Offboarding importiert"
                        : "Änderung angelegt"}
                  </p>
                  <p className="mt-1 text-sm text-[#71808b]">
                    {event.sourceFilename}
                  </p>
                  <p className="mt-1 text-xs text-[#94a0a8]">
                    {formatDate(event.importedAt)}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ChangeList({
  changes,
  emptyText = "Keine Änderungen protokolliert.",
}: {
  changes: AutomationChange[];
  emptyText?: string;
}) {
  const formatChangeValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const groupChanges = changes.filter(
    (change) =>
      change.resourceType === "AD-Gruppe" ||
      /gruppenmitgliedschaft/i.test(change.action),
  );
  const otherChanges = changes.filter(
    (change) => !groupChanges.includes(change),
  );
  const renderChange = (change: AutomationChange) => (
    <div
      key={change.id}
      className="grid gap-2 rounded-xl border border-[#e5eaed] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div>
        <p className="text-sm font-medium">{change.action}</p>
        <p className="mt-1 break-all font-mono text-xs text-[#667680]">
          {change.resourceType}: {change.resourceId}
        </p>
      </div>
      <div className="flex items-start gap-2 text-xs text-[#667680]">
        <Link2 className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {change.relation || "Direkt mit der Mitarbeiterakte verknüpft"}
        </span>
      </div>
      {(change.beforeValue || change.afterValue) && (
        <p className="text-xs text-[#7a8790] sm:col-span-2">
          Vorher: {formatChangeValue(change.beforeValue)} · Nachher:{" "}
          {formatChangeValue(change.afterValue)}
        </p>
      )}
    </div>
  );

  if (!changes.length)
    return (
      <p className="rounded-xl border border-dashed p-3 text-sm text-[#71808c]">
        {emptyText}
      </p>
    );

  return (
    <div className="space-y-2">
      {otherChanges.map(renderChange)}
      {!!groupChanges.length && (
        <details className="group overflow-hidden rounded-xl border border-[#dce3e7] bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-[#f7f9fa]">
            <ChevronRight className="size-4 text-[#176b87] transition-transform group-open:rotate-90" />
            <span>
              {groupChanges.length} Gruppenmitgliedschaft
              {groupChanges.length === 1 ? "" : "en"}
            </span>
            <span className="ml-auto text-xs font-normal text-[#71808c]">
              Aufklappen
            </span>
          </summary>
          <div className="space-y-2 border-t border-[#e5eaed] bg-[#f8fafb] p-3">
            {groupChanges.map(renderChange)}
          </div>
        </details>
      )}
    </div>
  );
}

function ExecutionHistory({
  person,
  runs,
  onRefresh,
  masterData,
}: {
  person: EmployeeRecord;
  runs: AutomationRun[];
  onRefresh: () => void;
  masterData: MasterDataItem[];
}) {
  const [message, setMessage] = useState("");
  const [rollbackRun, setRollbackRun] = useState<AutomationRun | null>(null);
  const [retryRun, setRetryRun] = useState<AutomationRun | null>(null);
  const retryActionType = retryRun ? failedAutomationAction(retryRun) : "";
  const availableActionTypes = new Set(
    buildAutomationJob(person, {}, automationOptions(masterData)).actions.map((action) => action.type),
  );
  async function rollback(run: AutomationRun, adCredential: AdCredential) {
    setMessage("");
    const response = await fetch("/api/executions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: run.id, mode: "Execute", adCredential }),
    });
    const data = (await response.json()) as ApiMessage;
    setMessage(
      response.ok
        ? "Rollback wurde an den Management-Agenten übergeben."
        : (data.error ?? "Rollback konnte nicht gestartet werden."),
    );
    if (response.ok && data.jobId) {
      setMessage("Rollback wurde gestartet. Ergebnis wird abgerufen …");
      setMessage(await collectExecutionResult(data.jobId, onRefresh));
    }
  }
  async function retryFailedAction(
    run: AutomationRun,
    adCredential?: AdCredential,
    initialPassword?: string,
    helpdeskCredential?: AdCredential,
  ) {
    const actionType = failedAutomationAction(run);
    const preparedJob = buildAutomationJob(person, {}, automationOptions(masterData));
    const actionIndex = preparedJob.actions.findIndex(
      (action) => action.type === actionType,
    );
    if (!actionType || actionIndex < 0) {
      setMessage(
        "Diese Aktion kann aus den aktuellen Daten nicht sicher rekonstruiert werden. Bitte den Schritt in der Automationsansicht erneut vorbereiten.",
      );
      return;
    }
    const retryJob = {
      ...preparedJob,
      jobId: `retry-${person.personnelNumber}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      requestedMode: "Execute" as const,
      retryOfRunId: run.id,
      retryAction: actionType,
      actions: [preparedJob.actions[actionIndex]],
      automationTaskIds:
        actionType === "ProvisionM365Mailbox"
          ? person.tasks
              .filter(
                (task) =>
                  task.status !== "done" &&
                  /e-?mail|postfach/i.test(task.title),
              )
              .map((task) => task.id)
          : run.status === "partial" &&
        actionIndex === preparedJob.actions.length - 1
          ? preparedJob.automationTaskIds
          : [],
    };
    setMessage(`${executionActionLabel(actionType)} wird erneut gestartet …`);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...retryJob,
          ...(adCredential ? { adCredential } : {}),
          ...(initialPassword ? { initialPassword } : {}),
          ...(helpdeskCredential ? { helpdeskCredential } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiMessage;
      if (!response.ok) {
        setMessage(data.error ?? "Die Aktion konnte nicht gestartet werden.");
        return;
      }
      setMessage(
        await collectExecutionResult(data.jobId ?? retryJob.jobId, onRefresh),
      );
    } catch {
      setMessage("Management-Agent nicht erreichbar.");
    }
  }
  if (!runs.length)
    return (
      <div className="rounded-xl border border-dashed p-5 text-sm text-[#71808c]">
        Noch keine Ausführung protokolliert. Nach einem Testlauf oder einer
        echten Ausführung erscheinen hier Ergebnis, Beziehungen und Rückweg.
      </div>
    );
  return (
    <div className="space-y-4">
      <AdCredentialDialog
        open={!!rollbackRun}
        setOpen={(open) => {
          if (!open) setRollbackRun(null);
        }}
        title="Rollback im AD starten"
        onSubmit={(credential) => {
          if (rollbackRun && credential) void rollback(rollbackRun, credential);
          setRollbackRun(null);
        }}
      />
      <AdCredentialDialog
        open={!!retryRun}
        setOpen={(open) => {
          if (!open) setRetryRun(null);
        }}
        title={
          retryRun
            ? `${executionActionLabel(retryActionType)} erneut ausführen`
            : "Aktion erneut ausführen"
        }
        requireAdCredential={retryActionType !== "CreateHelpdeskTicket"}
        requireInitialPassword={retryActionType === "CreateAdUser"}
        requireHelpdeskCredential={retryActionType === "CreateHelpdeskTicket"}
        onSubmit={(credential, initialPassword, helpdeskCredential) => {
          if (retryRun)
            void retryFailedAction(
              retryRun,
              credential,
              initialPassword,
              helpdeskCredential,
            );
          setRetryRun(null);
        }}
      />
      <div>
        <h3 className="font-semibold">Ausführungsverlauf</h3>
        <p className="mt-1 text-sm text-[#71808c]">
          Tatsächlich veränderte Objekte und ihre Beziehung zur Mitarbeiterakte.
        </p>
      </div>
      {message && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {message}
        </div>
      )}
      {runs.map((run) => (
        <Card key={run.id} className="border-[#dce3e7] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={badgeClass(run.status)}>
                  {run.operation === "execute" && run.relatedRunId
                    ? "Wiederholung"
                    : run.operation === "reference_check"
                      ? "Referenzprüfung"
                      : run.operation === "rollback"
                        ? "Rollback"
                        : run.mode === "WhatIf"
                          ? "Testlauf"
                          : "Ausführung"}
                </Badge>
                <span className="text-sm font-medium">
                  {statusText[run.status] ?? run.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-[#7a8790]">
                {formatDate(run.completedAt ?? run.startedAt)} · {run.jobId}
              </p>
              {run.operation === "execute" && run.relatedRunId && (
                <p className="mt-1 text-xs text-[#7a8790]">
                  Wiederholung aus Lauf {run.relatedRunId}
                </p>
              )}
            </div>
            {run.canRollback && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  >
                    <RotateCcw className="size-4" />
                    Rückgängig machen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Diese Ausführung rückgängig machen?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Der Agent arbeitet ausschließlich die unten
                      protokollierten Änderungen in umgekehrter Reihenfolge ab.
                      Manuelle Schritte und nicht sicher stornierbare Tickets
                      bleiben sichtbar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="max-h-64 space-y-2 overflow-auto">
                    {run.changes
                      .filter((change) => change.rollbackAction !== "manual")
                      .map((change) => (
                        <div
                          key={change.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <p className="font-medium">{change.rollbackAction}</p>
                          <p className="mt-1 text-xs text-[#71808c]">
                            {change.resourceType}: {change.resourceId}
                          </p>
                        </div>
                      ))}
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => setRollbackRun(run)}
                    >
                      Rollback starten
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {run.error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">Fehler des Management-Agenten</p>
                {run.operation === "execute" &&
                  run.mode === "Execute" &&
                  ["partial", "failed"].includes(run.status) &&
                  availableActionTypes.has(failedAutomationAction(run)) &&
                  !runs.some(
                    (candidate) =>
                      candidate.relatedRunId === run.id &&
                      candidate.status === "completed",
                  ) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-rose-300 bg-white text-rose-800 hover:bg-rose-100"
                      onClick={() => setRetryRun(run)}
                    >
                      <RotateCcw className="size-4" />
                      Nur diese Aktion erneut ausführen
                    </Button>
                  )}
              </div>
              <p className="mt-1 break-words">{run.error}</p>
              {failedAutomationAction(run) && (
                <div className="mt-2 space-y-1 text-xs text-rose-700">
                  <p>
                    Erkannte Aktion:{" "}
                    {executionActionLabel(failedAutomationAction(run))}
                  </p>
                  <p>
                    Vor der Wiederholung kurz prüfen, ob das Zielsystem die
                    Aktion trotz der Fehlermeldung bereits verarbeitet hat.
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="mt-4">
            {run.status === "queued" && !run.changes.length ? (
              <p className="rounded-xl border border-dashed p-3 text-sm text-[#71808c]">
                Ergebnis wird noch abgerufen.
              </p>
            ) : (
              <ChangeList changes={run.changes} />
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#7a8790]">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
