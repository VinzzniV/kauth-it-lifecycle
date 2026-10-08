"use client";

import { type FormEvent, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeReturn } from "@/lib/local-auth";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const passwordField = useRef<HTMLInputElement>(null);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }), signal: AbortSignal.timeout(15000) });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        if (passwordField.current) { passwordField.current.value = ""; passwordField.current.focus(); }
        throw new Error(data.error || "Die Anmeldung ist fehlgeschlagen.");
      }
      window.location.replace(safeReturn(new URLSearchParams(window.location.search).get("next")));
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "TimeoutError" && cause.name !== "TypeError" ? cause.message : "Der Server ist nicht erreichbar. Bitte erneut versuchen.");
      setBusy(false);
    }
  }
  return <main className="grid min-h-screen lg:grid-cols-2">
    <section className="relative flex flex-col justify-between gap-8 overflow-hidden bg-[#132238] px-6 py-8 text-white lg:p-14">
      <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#5de1d0] text-[#132238]"><UserRound className="size-6" /></div><div><p className="text-lg font-semibold">IT Lifecycle</p><p className="text-sm text-white/60">Kauth · Kontrollzentrum</p></div></div>
      <div className="relative hidden max-w-lg lg:block lg:py-20"><p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#5de1d0]">Mitarbeiter. Aufgaben. Klarer Überblick.</p><h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">Vom ersten Arbeitstag bis zum letzten.</h2><p className="mt-5 text-base leading-7 text-white/65">Eintritte, Änderungen und Austritte gemeinsam steuern. Alle Aufgaben und Ergebnisse bleiben in der Mitarbeiterakte nachvollziehbar.</p></div>
      <p className="hidden items-center gap-2 text-sm text-white/55 lg:flex"><ShieldCheck className="size-4 text-[#5de1d0]" />Interner Bereich für die IT-Verwaltung</p>
    </section>
    <section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:py-16">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe5e8] bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-6 grid size-12 place-items-center rounded-xl bg-[#e7f4f5] text-[#176b87]"><KeyRound className="size-6" /></div>
        <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1><p className="mt-2 text-sm leading-6 text-[#708090]">Mit den bestehenden IT-Lifecycle-Zugangsdaten anmelden.</p>
        <form onSubmit={signIn} className="mt-7 space-y-5" aria-busy={busy}>
          <div className="space-y-2"><label htmlFor="username" className="text-sm font-medium">Benutzername</label><Input id="username" name="username" autoComplete="username" required maxLength={256} className="h-11 bg-[#f5f7f8]" disabled={busy} onChange={() => setError("")} /></div>
          <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Passwort</label><div className="relative"><Input ref={passwordField} id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={2048} className="h-11 bg-[#f5f7f8] pr-12" disabled={busy} onChange={() => setError("")} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"} aria-pressed={visible} className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-[#708090] hover:bg-[#e7f4f5]">{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
          {error && <p id="login-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800">{error}</p>}
          <Button type="submit" disabled={busy} className="h-11 w-full">{busy ? <><LoaderCircle className="size-4 animate-spin" />Anmeldung läuft …</> : <>Anmelden<ArrowRight className="size-4" /></>}</Button>
        </form>
        <p className="mt-6 border-t pt-5 text-xs leading-5 text-[#708090]">Zugangsdaten fehlen? Bitte an die zuständige IT wenden.</p>
      </div>
    </section>
  </main>;
}
