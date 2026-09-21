"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleAlert, Clock3, ListChecks, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { ServiceItem, TaskItem } from "../../data";

type PublicAutomationRun = {
  status: string;
  startedAt: string;
  completedAt?: string | null;
  changes: Array<{ id: string }>;
};

type PublicEmployee = {
  personnelNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  jobTitle: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  tasks: TaskItem[];
  services: ServiceItem[];
  automationRuns: PublicAutomationRun[];
};

const statusText: Record<string, string> = {
  pending: "In Prüfung",
  active: "Aktiv",
  leaving: "Austritt läuft",
  inactive: "Inaktiv",
  completed: "Abgeschlossen",
  queued: "Wartet",
  partial: "Teilweise erledigt",
  failed: "Fehlgeschlagen",
  rolled_back: "Zurückgenommen",
};

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

export function PublicStatusView({ token }: { token: string }) {
  const [employee, setEmployee] = useState<PublicEmployee | null>(null);
  const [error, setError] = useState("");
  const [savingTask, setSavingTask] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/public/status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { employee?: PublicEmployee; error?: string };
    if (!response.ok || !data.employee) throw new Error(data.error || "Der Stand konnte nicht geladen werden.");
    setEmployee(data.employee);
  }, [token]);

  useEffect(() => {
    queueMicrotask(() => {
      void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Der Stand konnte nicht geladen werden."));
    });
  }, [load]);

  async function updateTask(task: TaskItem, done: boolean) {
    setSavingTask(task.id);
    setError("");
    const response = await fetch("/api/public/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, taskId: task.id, done }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(data.error || "Die Aufgabe konnte nicht gespeichert werden.");
    else await load();
    setSavingTask("");
  }

  if (error && !employee) return <main className="grid min-h-screen place-items-center bg-[#f3f6f8] p-6"><Card className="max-w-lg p-8 text-center"><CircleAlert className="mx-auto size-8 text-rose-600" /><h1 className="mt-4 text-xl font-semibold">Status nicht verfügbar</h1><p className="mt-2 text-[#667680]">{error}</p></Card></main>;
  if (!employee) return <main className="grid min-h-screen place-items-center bg-[#f3f6f8]"><p className="text-[#667680]">Aktueller Stand wird geladen …</p></main>;

  const done = employee.tasks.filter((task) => task.status === "done").length;
  const percent = employee.tasks.length ? Math.round(done / employee.tasks.length * 100) : 100;
  const latestRun = employee.automationRuns[0];
  return (
    <main className="min-h-screen bg-[#f3f6f8] text-[#162033]">
      <div className="bg-[#132238] text-white">
        <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
          <div className="flex items-center gap-3 text-sm text-white/65"><ShieldCheck className="size-5 text-[#5de1d0]" />IT Lifecycle · Statusansicht</div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-2xl font-semibold">{employee.firstName} {employee.lastName}</h1><p className="mt-1 text-white/65">#{employee.personnelNumber} · {employee.department} · {employee.jobTitle || "Keine Stellenbezeichnung"}</p></div>
            <Badge className="border-white/15 bg-white/10 text-white">{statusText[employee.status] || employee.status}</Badge>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-5xl gap-5 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          <Card className="border-[#dce3e7] p-5">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">Aufgaben</h2><p className="mt-1 text-sm text-[#667680]">Manuelle Aufgaben dürfen hier als erledigt markiert werden.</p></div><strong className="text-2xl text-[#176b87]">{percent}%</strong></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e6ecef]"><div className="h-full rounded-full bg-[#21a293] transition-all" style={{ width: `${percent}%` }} /></div>
            <div className="mt-5 space-y-3">
              {employee.tasks.map((task) => {
                const editable = task.executionType === "manual";
                return <div key={task.id} className="flex items-start gap-3 rounded-xl border border-[#e1e7ea] p-3.5"><Checkbox checked={task.status === "done"} disabled={!editable || savingTask === task.id} onCheckedChange={(checked) => void updateTask(task, checked === true)} aria-label={`${task.title} erledigen`} className="mt-0.5 data-[state=checked]:border-[#176b87] data-[state=checked]:bg-[#176b87]" /><div className="min-w-0 flex-1"><p className={task.status === "done" ? "text-sm font-medium text-[#73818b] line-through" : "text-sm font-medium"}>{task.title}</p><p className="mt-1 text-xs text-[#78858f]">{task.owner} · {editable ? "manuell" : "durch Automation"}</p></div>{task.status === "done" && <Check className="size-4 text-emerald-600" />}</div>;
              })}
            </div>
          </Card>
          <Card className="border-[#dce3e7] p-5"><h2 className="font-semibold">Bereitgestellte Zugänge und Geräte</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{employee.services.map((service) => <div key={service.id} className="rounded-xl border border-[#e1e7ea] p-3"><p className="text-sm font-medium">{service.label}</p><p className="mt-1 text-xs text-[#78858f]">{service.category} · {service.status}</p></div>)}</div></Card>
        </section>
        <aside className="space-y-5">
          <Card className="border-[#dce3e7] p-5"><div className="flex items-center gap-2"><ListChecks className="size-5 text-[#176b87]" /><h2 className="font-semibold">Vorgang</h2></div><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-[#78858f]">Fortschritt</dt><dd className="font-medium">{done} von {employee.tasks.length} Aufgaben</dd></div><div><dt className="text-[#78858f]">Termin</dt><dd className="font-medium">{formatDate(employee.endDate || employee.startDate)}</dd></div></dl></Card>
          <Card className="border-[#dce3e7] p-5"><div className="flex items-center gap-2"><Clock3 className="size-5 text-[#176b87]" /><h2 className="font-semibold">Letzte Automation</h2></div>{latestRun ? <div className="mt-4"><Badge variant="outline">{statusText[latestRun.status] || latestRun.status}</Badge><p className="mt-3 text-sm text-[#667680]">{formatDate(latestRun.completedAt || latestRun.startedAt)}</p><p className="mt-3 text-sm">{latestRun.changes.length} Änderungen protokolliert</p></div> : <p className="mt-4 text-sm text-[#667680]">Noch keine Automation ausgeführt.</p>}</Card>
          <p className="px-1 text-xs leading-5 text-[#78858f]">Diese Ansicht erlaubt keine Benutzeranlage, keine AD-Änderungen und keinen Zugriff auf Zugangsdaten.</p>
        </aside>
      </div>
    </main>
  );
}
