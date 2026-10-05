"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { readHrRows } from "@/lib/hr-import";
import { randomId } from "@/lib/random-id";
import { filterTasks, groupRuns, referenceMetadata, ruleOrigins, runGuidance, stateLabel, statusText, successfulRetry, type TaskFilter } from "@/lib/ui-projections";
import { ExecutionApprovalInfo, LatestResult, RecordSummary, RollbackInfo } from "./ui-info";
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
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  automations: { title: "Automationen", eyebrow: "Planung und Freigabe" },
  "master-data": { title: "Stammdaten", eyebrow: "Konfiguration" },
};
const executionActionText: Record<string, string> = {
  UpdateAdUser: "Benutzerkonto aktualisieren",
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
  location: "Standorte",
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
    masterData: items,
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
function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(20000) });
}
async function collectExecutionResult(
  jobId: string,
  onComplete: () => void,
  onResult?: (result: ImmediateExecutionResult) => void,
  onProgress?: (message: string) => void,
  onLiveProgress?: (progress: RunningExecutionProgress) => void,
) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const response = await apiFetch(
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
      {
        onComplete();
        if (result.status === "failed")
          return `Ausführung fehlgeschlagen und wurde protokolliert: ${result.error || "Unbekannter Fehler"}`;
        if (result.status === "partial")
          return `Ausführung nur teilweise abgeschlossen und wurde protokolliert: ${result.error || "Bitte den Verlauf prüfen."}`;
        if (result.operation === "reference_check")
          return "Referenzprüfung wurde in der Mitarbeiterakte gespeichert.";
        return `Ergebnis mit ${result.changes?.length ?? 0} protokollierten Änderung(en) wurde in der Mitarbeiterakte gespeichert.`;
      }
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
  const [recordTab, setRecordTab] = useState("inventory");
  const [draft, setDraft] = useState<EmployeeRecord | null>(null);
  const [importError, setImportError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recoveringJobs = useRef(new Set<string>());

  async function refreshEmployees() {
    const response = await apiFetch("/api/employees");
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
    apiFetch("/api/master-data")
      .then(async (r) => {
        const data = await r.json().catch(() => ({})) as { items?: MasterDataItem[]; error?: string };
        if (!r.ok || !data.items) throw new Error(data.error || "Stammdaten konnten nicht geladen werden. Bitte die Seite erneut laden.");
        return data;
      })
      .then((data) => {
        if (!data?.items) return;
        const merged = new Map(
          defaultMasterData.map((item) => [item.id, item]),
        );
        data.items.forEach((item) => merged.set(item.id, item));
        setMasterData(Array.from(merged.values()));
      })
      .catch((error) => setAppError(error instanceof Error ? error.message : "Stammdaten konnten nicht geladen werden."));
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
    referenceMetadata(employee).tasks.map((task) => ({ ...task, employee })),
  );
  const openTasks = allTasks.filter((item) => item.status !== "done");

  async function readFile(file: File) {
    setImportError("");
    setDraft(null);
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setImportError("Bitte eine CSV-, XLS- oder XLSX-Datei verwenden.");
      return;
    }
    try {
      const rows = readHrRows(await file.arrayBuffer(), file.name);
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
      const response = await apiFetch("/api/employees", {
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
    const response = await apiFetch("/api/employees", {
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
    const response = await apiFetch("/api/employees", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId: person.id }),
    });
    if (!response.ok) return;
    setEmployees((current) => current.filter((item) => item.id !== person.id));
    setDetailOpen(false);
    setActiveId(employees.find((item) => item.id !== person.id)?.id ?? "");
  }
  async function saveMasterItem(item: MasterDataItem): Promise<boolean> {
    try {
      const response = await apiFetch("/api/master-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) });
      const data = await response.json().catch(() => ({})) as ApiMessage;
      if (!response.ok) throw new Error(data.error || "Das Stammdatum konnte nicht gespeichert werden.");
      setMasterData((items) => items.filter((entry) => entry.id !== item.id).concat(item));
      setAppError(""); await refreshEmployees(); return true;
    } catch (error) { setAppError(error instanceof Error ? error.message : "Server nicht erreichbar. Der Entwurf bleibt erhalten."); return false; }
  }
  async function deleteMasterItem(id: string): Promise<boolean> {
    try {
      const response = await apiFetch("/api/master-data", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json().catch(() => ({})) as ApiMessage;
      if (!response.ok) throw new Error(data.error || "Das Stammdatum konnte nicht entfernt werden.");
      setMasterData((items) => items.map((item) => item.id === id ? { ...item, active: false } : item));
      setAppError(""); await refreshEmployees(); return true;
    } catch (error) { setAppError(error instanceof Error ? error.message : "Server nicht erreichbar."); return false; }
  }
  return (
    <div className="min-h-screen bg-[#f3f6f8] text-[#162033]">
      <Sidebar view={view} />
      <main className="lg:pl-[244px]">
        <nav aria-label="Navigation" className="flex flex-wrap gap-1 bg-[#132238] p-2 text-sm text-white lg:hidden">
          {[["/", "Übersicht"], ["/mitarbeiter", "Mitarbeiter"], ["/aufgaben", "Aufgaben"], ["/automationen", "Automationen"], ["/stammdaten", "Stammdaten"], ["/diagnose", "Diagnose"]].map(([href, label]) => <a key={href} href={href} className="shrink-0 rounded-lg px-3 py-2 hover:bg-white/10">{label}</a>)}
        </nav>
        <header className="sticky top-0 z-10 flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-[#dfe5e8] bg-white/95 px-5 py-3 backdrop-blur lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#708090]">
              {viewMeta[view].eyebrow}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {viewMeta[view].title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82909c]" />
              <Input
                aria-label="Mitarbeiter suchen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name oder Personalnummer"
                className="w-[200px] bg-[#f5f7f8] pl-9 md:w-[250px]"
              />
            </div>
            <Button
              disabled={loading}
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
                    referenceMetadata(employee).tasks.map((task) => ({ ...task, employee })),
                  )}
                  openTasks={openTasks.filter(
                    (task) => task.employee.status !== "completed",
                  )}
                  completion={activeProcesses.flatMap((employee) => referenceMetadata(employee).tasks).length ? Math.round(activeProcesses.flatMap((employee) => referenceMetadata(employee).tasks).filter((task) => task.status === "done").length / activeProcesses.flatMap((employee) => referenceMetadata(employee).tasks).length * 100) : 0}
                  active={
                    active?.status === "completed" ? activeProcesses[0] : active
                  }
                  setActive={(person) => {
                    setActiveId(person.id);
                    setRecordTab("inventory");
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
                    setRecordTab("inventory");
                    setDetailOpen(true);
                  }}
                  query={query}
                  resetSearch={() => setQuery("")}
                  onDrop={(file) => {
                    setImportOpen(true);
                    readFile(file);
                  }}
                />
              )}
              {view === "tasks" && (
                <TasksView tasks={allTasks.filter((task) => filtered.some((person) => person.id === task.employee.id))} onTask={updateTask} onOpen={(person) => { setActiveId(person.id); setRecordTab("tasks"); setDetailOpen(true); }} />
              )}
              {view === "automations" && (
                <AutomationsView
                  key={`${active?.id ?? "none"}-${active?.directoryTargetOu ?? ""}-${active?.directoryReferenceUser ?? ""}-${active?.directoryReferenceStatus ?? ""}`}
                  employees={filtered}
                  active={active}
                  setActive={(person) => setActiveId(person.id)}
                  openRecord={() => { setRecordTab("automation"); setDetailOpen(true); }}
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
          initialTab={recordTab}
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
        <a className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-white/65 hover:bg-white/5" href="/diagnose"><ShieldCheck className="size-4" />Diagnose</a>
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
      <section className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Offene Vorgänge"
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
          label="Aufgabenfortschritt"
          value={`${completion}%`}
          icon={<ShieldCheck />}
          tone="green"
          detail="Aufgaben der offenen Vorgänge erledigt"
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
          <TaskList tasks={openTasks.slice(0, 5)} onTask={onTask} onOpen={setActive} />
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
  query,
  resetSearch,
}: {
  employees: EmployeeRecord[];
  setActive: (person: EmployeeRecord) => void;
  onDrop: (file: File) => void;
  query: string;
  resetSearch: () => void;
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
      <EmployeeTable employees={employees} onOpen={setActive} full searching={Boolean(query)} resetSearch={resetSearch} />
    </div>
  );
}
function TasksView({
  tasks,
  onTask,
  onOpen,
}: {
  tasks: Array<TaskItem & { employee: EmployeeRecord }>;
  onOpen?: (person: EmployeeRecord) => void;
  onTask: (
    person: EmployeeRecord,
    task: TaskItem,
    status: TaskItem["status"],
  ) => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("open");
  const visible = filterTasks(tasks, filter);
  return (
    <Card className="border-[#dce3e7] bg-white p-5">
      <div className="mb-5">
        <h2 className="font-semibold">{filter === "open" ? "Offene Aufgaben" : filter === "done" ? "Erledigte Aufgaben" : "Alle Aufgaben"}</h2>
        <p className="mt-1 text-sm text-[#71808c]">
          Manuelle und automatisierbare Schritte aus allen Vorgängen
        </p>
      </div>
      <div className="mb-4 flex gap-2" aria-label="Aufgabenstatus">{([["open", "Offen"], ["done", "Erledigt"], ["all", "Alle"]] as const).map(([value, label]) => <Button key={value} variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}</div>
      {!visible.length && <p className="mb-3 text-sm">{filter === "open" ? "Keine offenen Aufgaben in dieser Auswahl." : "Keine Aufgaben in dieser Auswahl."}{filter === "open" && <Button variant="link" onClick={() => setFilter("done")}>Erledigte anzeigen</Button>}</p>}
      {!!visible.length && <TaskList tasks={visible} onTask={onTask} onOpen={onOpen} />}
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
    const response = await apiFetch("/api/employees", {
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
    if (mode === "Execute" && job.directory.targetOu === "REVIEW_REQUIRED" && job.actions.some((action) => ["CreateAdUser", "MoveAdUser"].includes(action.type))) {
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
      const response = await apiFetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...job,
          requestedMode: mode,
          executeApproved: mode === "Execute",
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
      const response = await apiFetch("/api/reference-check", {
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
          <RecordSummary person={active} />
          <LatestResult person={active} />
          <Button variant="outline" onClick={openRecord}>Ergebnis in der Akte ansehen</Button>
          <p className="text-sm text-[#667680]">Neuen vollständigen Auftrag vorbereiten: Dieser Plan umfasst alle angezeigten Aktionen. Er ist keine Einzelwiederholung eines bisherigen Laufs. Wiederholungen stehen in der Akte nur für nachweislich fehlgeschlagene Aktionen unter den bestehenden Sicherheitsprüfungen bereit.</p>
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
          {!job.actions.some((action) => ["CreateAdUser", "UpdateAdUser"].includes(action.type)) && job.lifecycleType !== "offboarding" && <Card className="border-amber-300 bg-amber-50 p-4 text-sm">Die Benutzerregel ist manuell oder deaktiviert. Gruppen, AD-Computer und M365 setzen einen bereits vorhandenen Benutzer voraus. Prüfen Sie dessen eindeutige Kontozuordnung vor der Freigabe; der Agent legt keinen Ersatzbenutzer an.</Card>}
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
                      <div className="flex max-w-full flex-col rounded-lg border border-[#dce3e7] p-1 sm:flex-row">
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
            <details><summary className="cursor-pointer text-sm font-medium">Geplante Aktionen und Regelherkunft</summary><div className="mt-5 space-y-2">
              {job.actions.map((action) => (
                <div
                  key={`${action.type}-${action.target}`}
                  className="flex items-center gap-3 rounded-xl border border-[#e1e7ea] px-4 py-3"
                >
                  <Check className="size-4 text-[#176b87]" />
                  <span className="text-sm font-medium">{executionActionLabel(action.type)}<span className="mt-1 block text-xs font-normal">{ruleOrigins(action, job, masterData).map((origin) => <a key={origin.label} href={origin.href} className="mr-2 text-[#176b87] underline">{origin.label}</a>)} · Als Agent-Schritt geplant; Ausführung nach Freigabe.</span></span>
                  <span className="ml-auto max-w-[50%] truncate text-xs text-[#78858f]">
                    {action.target}
                  </span>
                </div>
              ))}
            </div>
            </details>
          </Card>
          <Card className="overflow-hidden border-[#263a54] bg-[#132238] text-white">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileCode2 className="size-4 text-[#5de1d0]" />
                <h2 className="font-medium">Auftragsvorschau</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() =>
                  downloadText(
                    `${job.jobId}-vorschau.txt`,
                    buildPowerShellPreview(active, job),
                    "text/plain",
                  )
                }
              >
                <Download className="size-4" />
                Speichern
              </Button>
            </div>
            <details className="px-5 pb-4"><summary className="cursor-pointer text-sm">Technische Auftragsvorschau anzeigen</summary><pre className="max-h-80 overflow-auto p-5 text-sm leading-6 text-[#c8d7e5]">
              {buildPowerShellPreview(active, job)}
            </pre></details>
          </Card>
          <Card className="border-[#dce3e7] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">Neuen vollständigen Auftrag vorbereiten</p>
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
                  Testlauf (WhatIf)
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
                        Sie geben die unten genannten Aktionen dieses ausgewählten Auftrags frei.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <ExecutionApprovalInfo job={job} />
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
                      {stateLabel(latestExecution.status ?? "")}
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
  onSave: (item: MasterDataItem) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<MasterDataKind>("group");
  useEffect(() => {
    const register = new URLSearchParams(window.location.search).get("register");
    if (register && Object.keys(kindText).includes(register)) queueMicrotask(() => setKind(register as MasterDataKind));
  }, []);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [owner, setOwner] = useState("IT");
  const [editingId, setEditingId] = useState("");
  const [masterSaving, setMasterSaving] = useState(false);
  const visible = items.filter((item) => item.kind === kind);
  async function add() {
    if (!label.trim()) return;
    setMasterSaving(true);
    try { const success = await onSave({
      id: editingId || `${kind}-${Date.now()}`,
      kind,
      label: label.trim(),
      value: value.trim(),
      owner: owner.trim() || "IT",
      active: true,
    });
    if (!success) return;
    setLabel("");
    setValue("");
    setEditingId("");
    } finally { setMasterSaving(false); }
  }
  return (
    <Tabs
      value={kind}
      onValueChange={(next) => {
        setKind(next as MasterDataKind);
        setEditingId("");
        setLabel("");
        setValue("");
        setOwner("IT");
      }}
    >
      <TabsList className="mb-5 max-w-full flex-wrap h-auto">
        <TabsTrigger value="location">Standorte</TabsTrigger>
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
              Diese Werte steuern Vorschläge und Automationsaufträge. Aufgabenwert „agent“ plant einen Agent-Schritt; echte Ausführung erst nach ausdrücklicher Freigabe. „manual“ oder deaktivierte Regeln bleiben manuell. AD-Computeranlage ist eine separate Regel; physische Gerätebereitstellung bleibt manuell.
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
                  <TableCell className="font-medium">{item.label}{!item.active && <span className="ml-2 text-xs text-rose-700">deaktiviert</span>}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.value || "—"}
                  </TableCell>
                  <TableCell>{item.owner}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingId(item.id); setLabel(item.label); setValue(item.value); setOwner(item.owner); }}>Bearbeiten</Button>
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
          <h2 className="font-semibold">{editingId ? "Eintrag bearbeiten / aktivieren" : "Eintrag hinzufügen"}</h2>
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
              onClick={() => void add()}
              disabled={masterSaving}
              className="w-full bg-[#176b87] text-white hover:bg-[#12566d]"
            >
              <Plus className="size-4" />
              {editingId ? "Speichern" : "Hinzufügen"}
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
  searching = false,
  resetSearch,
}: {
  employees: EmployeeRecord[];
  onOpen: (person: EmployeeRecord) => void;
  full?: boolean;
  searching?: boolean;
  resetSearch?: () => void;
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
                      <button className="text-left font-medium text-[#176b87] underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(person); }} aria-label={`Akte öffnen: ${person.firstName} ${person.lastName}`}>
                        {person.firstName} {person.lastName}
                      </button>
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
          {searching ? <>Keine Mitarbeiter für diese Suche gefunden.<Button variant="link" onClick={resetSearch}>Suche zurücksetzen</Button></> : full ? "Noch keine Mitarbeiterakten vorhanden." : "Keine offenen Vorgänge. Abgeschlossene Akten bleiben unter Mitarbeiterakten erhalten."}
        </div>
      )}
    </Card>
  );
}
function TaskList({
  tasks,
  onTask,
  onOpen,
}: {
  tasks: Array<TaskItem & { employee: EmployeeRecord }>;
  onOpen?: (person: EmployeeRecord) => void;
  onTask: (
    person: EmployeeRecord,
    task: TaskItem,
    status: TaskItem["status"],
  ) => void;
}) {
  return (
    <div className="space-y-3">
      {!tasks.length && <p className="text-sm text-[#667680]">Keine offenen Aufgaben in dieser Auswahl.</p>}
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
              {onOpen ? <button className="text-[#176b87] underline" onClick={() => onOpen(task.employee)} aria-label={`Akte öffnen: ${task.employee.firstName} ${task.employee.lastName}`}>{task.employee.firstName} {task.employee.lastName}</button> : `${task.employee.firstName} ${task.employee.lastName}`} · {task.owner}
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
    <Card className="gap-2 border-[#dce3e7] bg-white p-3 sm:gap-4 sm:p-5">
      <div className="mb-2 flex items-start justify-between sm:mb-4">
        <p className="text-sm text-[#6d7c87]">{label}</p>
        <div
          className={`hidden size-9 place-items-center rounded-xl sm:grid [&>svg]:size-4 ${colors[tone]}`}
        >
          {icon}
        </div>
      </div>
      <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
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
                      : draft.events[0].type === "change" ? "Wechsel" : "Offboarding"}
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
  initialTab,
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
  initialTab: string;
}) {
  const job = buildAutomationJob(person, {}, automationOptions(masterData));
  const projection = referenceMetadata(person);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shareMessage, setShareMessage] = useState("");
  async function changeShare(shareAction: "rotate" | "revoke") {
    try {
      const response = await apiFetch("/api/employees", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId: person.id, shareAction }) });
      if (!response.ok) throw new Error("Statuslink konnte nicht geändert werden.");
      setShareMessage(shareAction === "rotate" ? "Neuer Leselink erstellt (30 Tage). Alte Links sind widerrufen." : "Statuslink widerrufen.");
      onRefresh();
    } catch (error) { setShareMessage(error instanceof Error ? error.message : "Statuslink konnte nicht geändert werden."); }
  }
  const statusUrl = person.shareToken && person.shareExpiresAt && typeof window !== "undefined"
    ? `${window.location.origin}/status/${person.shareToken}`
    : "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} onOpenAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus(); }} className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <div className="shrink-0 bg-[#132238] p-4 text-white sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="hidden size-14 place-items-center rounded-2xl bg-[#5de1d0] text-lg font-semibold text-[#132238] sm:grid">
              {initials(person)}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle ref={headingRef} tabIndex={-1} className="text-xl">
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
            <div className="flex flex-wrap items-center gap-2">
            <DialogClose asChild><Button variant="outline" className="border-white/40 bg-white text-[#132238]">Schließen</Button></DialogClose>
            <details className="relative text-sm"><summary className="cursor-pointer rounded-lg border border-white/40 px-3 py-2">Weitere Aktionen</summary><div className="absolute right-0 z-20 mt-1 rounded-lg border bg-white p-2 text-[#162033]">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="text-rose-700"
                  aria-label="Mitarbeiter löschen"
                >
                  <Trash2 className="size-4" />
                  Mitarbeiter löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mitarbeiterakte löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Die Akte von {person.firstName} {person.lastName} sowie
                    Aufgaben, Systeme und Historie werden dauerhaft entfernt.
                    Akten mit laufenden oder ausgeführten Aufträgen bleiben erhalten. Erledigte Vorgänge werden automatisch aus der offenen Übersicht entfernt und stehen später für Wechsel und Offboarding bereit.
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
            </div></details></div>
          </div>
        </div>
        <Tabs key={`${person.id}-${initialTab}`} defaultValue={initialTab} className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
          <TabsList variant="line" className="h-auto shrink-0 flex-wrap gap-1 border-b bg-white px-3 py-2 sm:px-6">
            <TabsTrigger value="inventory">
              <Boxes />
              Ausstattung & Bestand
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
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6" data-testid="record-scroll">
          <RecordSummary person={person} />
          <TabsContent value="inventory">
            {(projection.name || projection.references.length > 0) && <section className="mb-4 mt-4 rounded-xl border p-4"><h3 className="font-semibold">Referenzmetadaten</h3><p className="mt-2 text-sm">Berechtigungen nach Referenzprofil: {projection.name || "mehrere Referenzangaben – intern prüfen"}</p><p className="text-xs text-[#667680]">Referenzprüfung: {stateLabel(person.directoryReferenceStatus || "unknown")} · {person.directoryReferenceMessage || "Nicht bestätigt"}</p><p className="mt-2 text-xs text-[#667680]">Referenzangaben sind keine Anwendungen oder Bereitstellungsaufgaben. Historische Einträge bleiben unter Historie erhalten.</p></section>}
            <details className="mb-4 mt-4"><summary className="cursor-pointer font-medium">Freigegebene Statusansicht</summary>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void changeShare("rotate")}>Leselink neu erstellen (30 Tage)</Button>
              {person.shareToken && <Button variant="outline" onClick={() => void changeShare("revoke")}>Leselink widerrufen</Button>}
              {shareMessage && <p className="w-full text-sm">{shareMessage}</p>}
            </div>
            {statusUrl && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#bcdde1] bg-[#eef7f8] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-[#12566d]">Freigegebene Statusansicht</p>
                  <p className="mt-1 text-sm text-[#56727b]">Reine Leseansicht mit begrenzten Daten. Gültig bis {formatDate(person.shareExpiresAt)}.</p>
                </div>
                <a href={statusUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#8cc8cf] bg-white px-3 text-sm font-medium text-[#12566d] hover:bg-[#f8ffff]">
                  <Link2 className="size-4" />Vorschau öffnen
                </a>
              </div>
            )}
            </details>
            <div className="grid gap-3 sm:grid-cols-2">
              {projection.services.map((service) => (
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
                      {stateLabel(service.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="tasks">
            <TasksView
              tasks={projection.tasks.map((task) => ({
                ...task,
                employee: person,
              }))}
              onTask={onTask}
            />
          </TabsContent>
          <TabsContent value="automation">
            <div className="my-4"><LatestResult person={person} /></div>
            <ExecutionHistory person={person} runs={person.automationRuns ?? []} onRefresh={onRefresh} masterData={masterData} />
            <details className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer font-medium">Plan / Vorschau eines neuen vollständigen Auftrags</summary>
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
                  {buildPowerShellPreview(person, job)}
                </pre>
              </div>
            </div>
            </details>
          </TabsContent>
          <TabsContent value="history">
            {(projection.references.length > 0 || projection.referenceTasks.length > 0) && <details className="my-4 rounded-xl border p-3"><summary>Historische Referenzangaben (unverändert erhalten)</summary>{projection.references.map((item) => <p key={item.id} className="mt-2 text-sm">{item.label} · {item.source} · {stateLabel(item.status)}</p>)}{projection.referenceTasks.map((task) => <p key={task.id} className="mt-2 text-sm">{task.title} · {stateLabel(task.status)}</p>)}</details>}
            <div className="mb-5 space-y-3">
              <h3 className="font-semibold">Änderungsprotokoll</h3>
              {(person.auditEntries ?? []).map((entry) => <div key={entry.id} className="rounded-xl border p-3"><p className="text-sm font-medium">{entry.action}</p><p className="mt-1 text-xs text-[#667680]">{formatDate(entry.createdAt)}</p><details><summary className="cursor-pointer text-sm">Protokolldetails</summary><p className="mt-1 break-words text-sm text-[#71808b]">{entry.detail.split(/\b(done|failed|partial|completed|requested|simulated|open|ready)\b/).map((part, index) => <span key={index}>{statusText[part] ?? part}</span>)}</p></details></div>)}
            </div>
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
          </div>
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
        <details className="mt-1 text-xs text-[#667680]"><summary className="cursor-pointer">Technische Kennung</summary><p className="break-all font-mono">
          {change.resourceType}: {change.resourceId}
        </p></details>
      </div>
      <div className="flex items-start gap-2 text-xs text-[#667680]">
        <Link2 className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {change.relation || "Direkt mit der Mitarbeiterakte verknüpft"}
        </span>
      </div>
      {(change.beforeValue || change.afterValue) && (
        <details className="text-xs text-[#667680] sm:col-span-2"><summary className="cursor-pointer">Technische Vorher/Nachher-Daten</summary><p className="break-all">
          Vorher: {formatChangeValue(change.beforeValue)} · Nachher:{" "}
          {formatChangeValue(change.afterValue)}
        </p></details>
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
  const [selectedRetryAction, setSelectedRetryAction] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{ run: AutomationRun; action: string; resolution: "verified_no_effect" | "rollback_conflict_resolved" } | null>(null);
  const [reviewEvidence, setReviewEvidence] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  function openReview(run: AutomationRun, action: string) {
    setReviewTarget({ run, action, resolution: run.operation === "rollback" ? "rollback_conflict_resolved" : "verified_no_effect" });
    setReviewEvidence(""); setReviewConfirmed(false);
  }
  async function saveReview() {
    if (!reviewTarget || !reviewConfirmed || reviewEvidence.trim().length < 20) return;
    setReviewSaving(true);
    try {
      const response = await apiFetch("/api/executions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: reviewTarget.run.id, action: reviewTarget.action, resolution: reviewTarget.resolution, evidence: reviewEvidence.trim() }) });
      const data = await response.json().catch(() => ({})) as ApiMessage;
      if (!response.ok) throw new Error(data.error || "Die Klärung konnte nicht gespeichert werden.");
      setReviewTarget(null); setMessage("Manuelle Prüfung protokolliert. Eine neue Ausführung benötigt weiterhin Ihre ausdrückliche Freigabe."); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Prüfung konnte nicht gespeichert werden."); }
    finally { setReviewSaving(false); }
  }
  const retryActionType = retryRun ? selectedRetryAction || failedAutomationAction(retryRun) : "";
  async function rollback(run: AutomationRun, adCredential: AdCredential) {
    setMessage("");
    const response = await apiFetch("/api/executions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: run.id, mode: "Execute", executeApproved: true, adCredential }),
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
    const actionType = selectedRetryAction || failedAutomationAction(run);
    const preparedJob = buildAutomationJob(person, {}, automationOptions(masterData));
    if (!actionType) {
      setMessage(
        "Diese Aktion kann aus den aktuellen Daten nicht sicher rekonstruiert werden. Bitte den Schritt in der Automationsansicht erneut vorbereiten.",
      );
      return;
    }
    const retryJob = {
      ...preparedJob,
      jobId: `retry-${randomId()}`,
      createdAt: new Date().toISOString(),
      requestedMode: "Execute" as const,
      executeApproved: true,
      retryOfRunId: run.id,
      retryAction: actionType,
      actions: preparedJob.actions.filter((action) => action.type === actionType),
    };
    setMessage(`${executionActionLabel(actionType)} wird erneut gestartet …`);
    try {
      const response = await apiFetch("/api/agent", {
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
      <Dialog open={!!reviewTarget} onOpenChange={(open) => { if (!open && !reviewSaving) setReviewTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Externen Zustand manuell klären</DialogTitle><DialogDescription>Auftrag {reviewTarget?.run.jobId}: {reviewTarget?.action === "unknown" ? "Unbekannte externe Wirkung" : executionActionLabel(reviewTarget?.action ?? "")}.</DialogDescription></DialogHeader>
          <p className="text-sm">{reviewTarget?.resolution === "rollback_conflict_resolved" ? "Prüfen und bereinigen Sie den Rücknahmekonflikt im Zielsystem. Die nächste Rücknahme kontrolliert den aktuellen Zustand erneut." : "Prüfen Sie das Zielsystem und die Gateway-Protokolle. Freigabe nur, wenn diese Aktion keine externe Änderung bewirkt hat. Bei vorhandenen Änderungen bleibt der Auftrag gesperrt und erfordert manuelle Nacharbeit."}</p>
          <label className="space-y-2 text-sm">Prüfnachweis (mindestens 20 Zeichen)<Textarea value={reviewEvidence} onChange={(event) => setReviewEvidence(event.target.value)} maxLength={2000} placeholder="Geprüftes Objekt, Zeitpunkt und Ergebnis; keine Kennwörter oder Tokens" /></label>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={reviewConfirmed} onCheckedChange={(checked) => setReviewConfirmed(checked === true)} />{reviewTarget?.resolution === "rollback_conflict_resolved" ? "Extern geprüft: Rücknahmekonflikt manuell bereinigt; aktueller Zustand geprüft." : "Extern geprüft: keine Wirkung dieser Aktion; eine erneute Ausführung ist sicher."}</label>
          <DialogFooter><Button variant="outline" disabled={reviewSaving} onClick={() => setReviewTarget(null)}>Abbrechen</Button><Button disabled={reviewSaving || !reviewConfirmed || reviewEvidence.trim().length < 20} onClick={() => void saveReview()}>Prüfung protokollieren</Button></DialogFooter>
        </DialogContent>
      </Dialog>
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
      {groupRuns(runs).map((group, index) => <details key={group.root.id} open={index === 0} className="rounded-xl border bg-[#f8fafb] p-3"><summary className="cursor-pointer text-sm font-semibold">Ausgangslauf · {formatDate(group.root.startedAt)} · {stateLabel(group.root.status)}{group.related.length > 0 ? ` · ${group.related.length} zugeordnete Wiederholungen / Rücknahmen` : ""}</summary><div className="mt-3 space-y-3">{[group.root, ...group.related].map((run) => (
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
                        ? "Rücknahme"
                        : run.mode === "WhatIf"
                          ? "Testlauf (WhatIf)"
                          : "Ausführung"}
                </Badge>
                <span className="text-sm font-medium">
                  {stateLabel(run.status)}
                </span>
              </div>
              <details className="mt-2 text-xs text-[#667680]"><summary>Technische Laufkennungen</summary><p>{formatDate(run.completedAt ?? run.startedAt)} · {run.jobId}</p></details>
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
                <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Unterstützte Änderungen dieses Laufs zurücknehmen?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Dies ist eine begrenzte Rücknahme, keine vollständige Rückabwicklung. Der Umfang stammt aus dem ausgewählten Lauf.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <RollbackInfo run={run} person={person} />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => setRollbackRun(run)}
                    >
                      Rücknahme vorbereiten
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {(run.error || run.actionResults?.some((item) => item.status === "failed")) && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">Fehler des Management-Agenten</p>
                {run.operation === "execute" && run.mode === "Execute" && ["partial", "failed", "reviewed"].includes(run.status) && (run.actionResults ?? []).filter((item) => item.status === "failed" && !successfulRetry(runs, run, item.action)).map((item) => (
                  <Button key={item.action} variant="outline" size="sm" className="border-rose-300 bg-white text-rose-800 hover:bg-rose-100" onClick={() => { setSelectedRetryAction(item.action); setRetryRun(run); }}>
                    <RotateCcw className="size-4" />{executionActionLabel(item.action)} wiederholen
                  </Button>
                ))}
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
            <p className="mb-3 text-sm text-[#667680]">{runGuidance(run, runs)}</p>
            {(run.status === "review_required" || run.actionResults?.some((item) => item.status === "review_required")) && <div className="mb-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3"><p className="text-sm">Keine automatische Wiederholung: Der externe Zustand muss zuerst manuell geprüft werden.</p>{run.operation === "rollback" ? <Button variant="outline" onClick={() => openReview(run, "rollback")}>Rücknahmekonflikt klären</Button> : (run.actionResults?.filter((item) => item.status === "review_required").length ? run.actionResults.filter((item) => item.status === "review_required").map((item) => <Button key={item.action} variant="outline" onClick={() => openReview(run, item.action)}>{executionActionLabel(item.action)} klären</Button>) : <Button variant="outline" onClick={() => openReview(run, "unknown")}>Unbekannte Wirkung klären</Button>)}</div>}
            {(run.actionResults ?? []).length > 0 && <div className="mb-3 space-y-2">{run.actionResults?.map((item) => <div key={item.action} className="rounded-lg border p-2 text-sm"><span className="font-medium">{executionActionLabel(item.action)}</span> · {item.status === "review_required" ? "Prüfung erforderlich – externe Wirkung klären, keine automatische Wiederholung" : statusText[item.status] ?? item.status}{item.error && <p className="mt-1 break-words text-rose-700">{item.error}</p>}</div>)}</div>}
            {run.status === "queued" && !run.changes.length ? (
              <p className="rounded-xl border border-dashed p-3 text-sm text-[#71808c]">
                Ergebnis wird noch abgerufen.
              </p>
            ) : (
              <ChangeList changes={run.changes} />
            )}
          </div>
        </Card>
      ))}</div></details>)}
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
