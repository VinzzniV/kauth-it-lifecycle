"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Document navigation rechecks authentication and avoids cached router redirects after login. */
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, CircleAlert, Database, GitBranch, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "../lifecycle-app";
import { LogoutButton, MobileNavigation } from "../auth-controls";

type DiagnosticsResult = { revision: string; database: string; gateway: string; authentication: string; pending: { status: string; count: number }[] };
const pendingLabels: Record<string, string> = { queued: "Wartet auf Verarbeitung", running: "In Bearbeitung", review_required: "Prüfung erforderlich" };

export default function Diagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 20000);
    fetch("/api/diagnostics", { signal: controller.signal, cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { window.location.replace("/login?next=%2Fdiagnose"); return; }
      const body = await r.json() as DiagnosticsResult & { error?: string };
      if (!r.ok) throw new Error(body.error);
      setDiagnostics(body);
      setCheckedAt(new Date().toLocaleString("de-DE"));
    }).catch(() => { if (!controller.signal.aborted || controller.signal.reason === "timeout") setError("Die Diagnose konnte nicht geladen werden. Bitte die Verbindung prüfen und erneut versuchen."); }).finally(() => { clearTimeout(timeout); if (!controller.signal.aborted || controller.signal.reason === "timeout") setChecking(false); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [refresh]);
  const components = [
    { label: "Datenbank", icon: Database, good: diagnostics?.database === "ok", status: "Erreichbar", description: "Die lokale Datenbank beantwortet die Prüf-Abfrage.", problem: "Die Datenbank ist nicht erreichbar." },
    { label: "Windows-Gateway", icon: Server, good: diagnostics?.gateway === "ok", status: "Erreichbar", description: "Das Gateway beantwortet die Bereitschaftsprüfung.", problem: "Das Gateway ist nicht erreichbar. Bitte den Gateway-Betrieb prüfen." },
    { label: "Anmeldung", icon: ShieldCheck, good: diagnostics?.authentication === "enabled", status: "Aktiviert", description: "Der interne Bereich ist durch die Anmeldung geschützt.", problem: "Der lokale Anmeldeschutz ist deaktiviert." },
  ];
  const total = diagnostics?.pending.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const good = components.every((component) => component.good);
  return <div className="min-h-screen bg-[#f3f6f8] text-[#162033]">
    <Sidebar view="diagnostics" />
    <main className="lg:pl-[244px]">
      <MobileNavigation current="/diagnose" />
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe5e8] bg-white/95 px-5 py-4 backdrop-blur lg:px-8">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#708090]">System & Betrieb</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Betriebsdiagnose</h1></div>
        <div className="flex flex-wrap items-center gap-3"><Button asChild variant="outline"><a href="/"><ArrowLeft className="size-4" />Zur Übersicht</a></Button><LogoutButton /></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 p-5 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Betriebsstatus im Überblick</h2><p className="mt-1 text-sm text-[#708090]">Erreichbarkeit der Komponenten und offene Automationsaufträge.</p></div><Button variant="outline" disabled={checking} onClick={() => { setError(""); setChecking(true); setRefresh((value) => value + 1); }}><RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} />{checking ? "Wird geprüft …" : "Aktualisieren"}</Button></div>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}{diagnostics && <p className="mt-1">Die angezeigten Werte stammen aus der letzten erfolgreichen Prüfung.</p>}</div>}
        <div role="status" className={`flex items-start gap-3 rounded-xl border p-4 ${!diagnostics || error || checking ? "border-[#dfe5e8] bg-white" : good ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          {!diagnostics || checking ? <Activity className="mt-0.5 size-5 shrink-0 text-[#176b87]" /> : good && !error ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />}
          <div><p className="font-medium">{checking ? "Komponenten werden geprüft …" : error ? "Aktuelle Prüfung nicht verfügbar" : good ? "Alle geprüften Komponenten sind verfügbar" : "Eine Komponente benötigt Aufmerksamkeit"}</p><p className="mt-1 text-sm text-[#708090]">{checkedAt ? `Letzte erfolgreiche Prüfung: ${checkedAt}` : "Es liegt noch kein Prüfergebnis vor."}</p></div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">{components.map((component) => <section key={component.label} className="rounded-2xl border border-[#dfe5e8] bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between gap-2"><component.icon className="size-5 text-[#176b87]" /><span className={`rounded-full px-3 py-1 text-xs font-medium ${!diagnostics ? "bg-slate-100 text-slate-600" : component.good ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{!diagnostics ? "Nicht geprüft" : component.good ? component.status : "Prüfung erforderlich"}</span></div><h3 className="font-semibold">{component.label}</h3><p className="mt-2 text-sm leading-6 text-[#708090]">{!diagnostics ? "Das Ergebnis wird nach der Prüfung angezeigt." : component.good ? component.description : component.problem}</p></section>)}</div>
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-[#dfe5e8] bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Activity className="size-5 text-[#176b87]" />Offene Aufträge</h2>{diagnostics && <span className="rounded-lg bg-[#f3f6f8] px-3 py-1 text-sm font-medium">{total}</span>}</div>{!diagnostics ? <p className="mt-4 text-sm text-[#708090]">Noch kein Prüfergebnis verfügbar.</p> : total ? <ul className="mt-4 divide-y">{diagnostics.pending.map((item) => <li key={item.status} className="flex justify-between gap-4 py-3 text-sm"><span>{pendingLabels[item.status] || "Unbekannter Auftragsstatus"}</span><span className="font-semibold tabular-nums">{item.count}</span></li>)}</ul> : <p className="mt-4 rounded-xl bg-[#f5f7f8] p-4 text-sm text-[#708090]">Keine offenen Aufträge.</p>}<Button asChild variant="link" className="mt-3 px-0"><a href="/automationen">Zu den Automationen</a></Button></section>
          <section className="rounded-2xl border border-[#dfe5e8] bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-semibold"><GitBranch className="size-5 text-[#176b87]" />Installierter Stand</h2><p className="mt-4 text-xs font-medium uppercase tracking-wide text-[#708090]">Git-Revision</p><p className="mt-2 break-all rounded-lg bg-[#f5f7f8] p-3 font-mono text-xs">{diagnostics?.revision ?? "Noch nicht ermittelt"}</p><p className="mt-4 text-sm leading-6 text-[#708090]">Die Erreichbarkeitsprüfung bestätigt keine Ausführung in AD, Microsoft 365 oder HelpDesk. Ergebnisse einzelner Aufträge stehen unter Automationen.</p></section>
        </div>
      </div>
    </main>
  </div>;
}
