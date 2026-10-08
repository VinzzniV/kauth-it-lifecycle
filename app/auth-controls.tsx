"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      window.location.replace("/login");
    } catch { setError("Abmelden fehlgeschlagen. Bitte erneut versuchen."); setBusy(false); }
  }
  return <div><Button variant="outline" disabled={busy} onClick={logout}><LogOut className="size-4" /><span>{busy ? "Abmelden …" : "Abmelden"}</span></Button>{error && <p role="alert" className="mt-2 max-w-64 text-xs text-red-700">{error}</p>}</div>;
}

export function MobileNavigation({ current }: { current: string }) {
  return <nav aria-label="Navigation" className="flex flex-wrap gap-1 bg-[#132238] p-2 text-sm text-white lg:hidden">
    {[["/", "Übersicht"], ["/mitarbeiter", "Mitarbeiter"], ["/aufgaben", "Aufgaben"], ["/automationen", "Automationen"], ["/stammdaten", "Stammdaten"], ["/diagnose", "Diagnose"]].map(([href, label]) => <a key={href} href={href} aria-current={current === href ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 hover:bg-white/10 ${current === href ? "bg-white/10 text-[#5de1d0]" : ""}`}>{label}</a>)}
  </nav>;
}
