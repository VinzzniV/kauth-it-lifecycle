# Kauth IT Lifecycle: dauerhafte Regeln

- Architektur: eine Webanwendung (React/vinext/Vite), lokale SQLite/D1-Datenbank, ein Windows-Gateway, eine lokale `.env` fuer Web und Gateway.
- Technische Ziele und Geheimnisse in `.env`; fachliche Standorte, OUs, Gruppen, Anwendungen und Aufgaben in Stammdaten; konkrete Zuweisungen und Wirkungen in Mitarbeiterakten.
- `app/` enthaelt Oberflaeche und APIs, `lib/` Vertraege/Persistenz/Import, `db/` Schema, `drizzle/` Migrationen, `public/agent/` PowerShell, `scripts/` Betriebshilfen.
- TypeScript strikt, zwei Leerzeichen, doppelte Anfuehrungszeichen, deutsche Bedienoberflaeche. PowerShell bleibt 5.1-kompatibel; Parserpruefung ersetzt keinen Laufzeittest.
- Node >=22.16 (SQLite-Backup); geprueft mit 22.23.3. Lockdatei erhalten; `npm ci`, `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`.
- Neue Jobs serverseitig planen und atomar sperren. Ergebnisse ausschliesslich vom authentifizierten Gateway importieren, gegen gespeicherten Auftrag binden und atomar/idempotent speichern.
- Execute braucht ausdrueckliche Freigabe. WhatIf erledigt keine realen Aufgaben und nimmt keinen Ausgangslauf zurueck. Unklare externe Wirkung erfordert Pruefung statt blindem Neustart.
- Einzelwiederholung nur fuer nachweislich fehlgeschlagene Aktionen. GUID-basierte AD-Ruecknahme prueft aktuellen Zustand; Tickets/M365 ohne implementierten Ruecknahmeweg bleiben manuell.
- Akten und Historie nach Abschluss erhalten. Statuslinks sind begrenzte, widerrufbare Leseansichten; Aufgaben aendern nur nach interner Anmeldung.
- Lokale Aenderungen und Produktion bewahren; isolierte Worktrees, Datenbanken, Queues, Ports und Tokens. Externe Mutationen nur mit ausdruecklicher Freigabe benannter Aktionen/Objekte.
- Keine Geheimnisse, private Schluessel, Personaldaten oder Queue-Artefakte in Git, Buildkontext, Logs oder Berichten. HTTPS ausserhalb isolierter Testadapter.
- Native Unteragenten bei beauftragter Teamarbeit: disjunkte Dateien, maximal zwei Implementierer; Schema/Vertraege/Integration beim Hauptagenten; unabhaengige Pruefung nach Integration; kein paralleles Staging/Committen.
- Massgeblich sind aktueller Code und Tests. Auditbefunde vor Korrektur verifizieren. Kurzer Arbeitsstand in IMPLEMENTATION-PLAN.md; Betriebsbefehle in OPERATIONS.md.
