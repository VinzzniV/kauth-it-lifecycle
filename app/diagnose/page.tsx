"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Diagnostics() {
  const [diagnostics, setDiagnostics] = useState<{ revision: string; database: string; gateway: string; authentication: string; pending: { status: string; count: number }[] }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/diagnostics", { signal: controller.signal }).then(async (r) => {
      const body = await r.json() as { error?: string; revision: string; database: string; gateway: string; authentication: string; pending: { status: string; count: number }[] };
      if (!r.ok) throw new Error(body.error);
      setDiagnostics(body);
    }).catch((e) => { if (e.name !== "AbortError") setError("Diagnose konnte nicht geladen werden."); });
    return () => controller.abort();
  }, []);
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <Link href="/">Zur Übersicht</Link><h1 className="text-2xl font-semibold">Betriebsdiagnose</h1>
    {error && <p role="alert">{error}</p>}
    {!diagnostics && !error && <p>Komponenten werden geprüft …</p>}
    {diagnostics && <><dl className="grid grid-cols-2 gap-3 break-all">
      <dt>Git-Revision</dt><dd>{diagnostics.revision}</dd><dt>Datenbank</dt><dd>{diagnostics.database}</dd>
      <dt>Windows-Gateway</dt><dd>{diagnostics.gateway}</dd><dt>Anmeldung</dt><dd>{diagnostics.authentication}</dd>
    </dl><h2 className="text-lg font-semibold">Offene Aufträge</h2>
      {diagnostics.pending.length ? <ul>{diagnostics.pending.map((p) => <li key={p.status}>{p.status === "review_required" ? "Prüfung erforderlich" : p.status}: {p.count}</li>)}</ul> : <p>Keine offenen Aufträge.</p>}</>}
  </main>;
}
