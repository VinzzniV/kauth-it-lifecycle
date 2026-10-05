# Kauth IT Lifecycle V1

Eine Webanwendung mit lokaler SQLite-Datenbank und Windows-Gateway für HR-Laufkarten, Mitarbeiterakten, Aufgaben und freigegebene AD-/M365-/HelpDesk-Aktionen.

## Arbeitsablauf

1. CSV/XLS/XLSX einlesen, erkannte Person, Vorgang und IT-Positionen prüfen und speichern.
2. In der Akte Referenzbenutzer prüfen oder eine vollständige Ziel-OU festlegen. Computer neu planen oder ein vorhandenes Gerät zuweisen.
3. WhatIf ausführen. Für Execute die angezeigten Aktionen ausdrücklich freigeben und benötigte, getrennte Anmeldungen übergeben.
4. Ergebnisse werden vom Gateway authentifiziert und dauerhaft serverseitig übernommen. Der Browser darf geschlossen werden.
5. Eindeutig fehlgeschlagene Aktionen einzeln wiederholen. Bei unklarer Wirkung zuerst externe Systeme prüfen und den Prüfnachweis dokumentieren.
6. Manuelle Aufgaben erledigen. Abgeschlossene Vorgänge verlassen die offene Übersicht; die Akte und ihre Historie bleiben erhalten.

Unterstützte AD-Änderungen lassen sich nach GUID- und Zustandsprüfung gezielt zurücknehmen. WhatIf-Rücknahmen verändern weder externe Systeme noch Ausgangsläufe. Tickets und M365-Lizenzen werden nicht automatisch zurückgenommen. Offboarding enthält konkrete manuelle Nacharbeiten für M365 und HelpDesk.

## Konfiguration und Regeln

Web und Gateway verwenden dieselbe lokale `.env` für technische Ziele und Geheimnisse. Fachliche Standorte, Gruppen, OUs, Anwendungen und Aufgaben werden in **Stammdaten** gepflegt. Physische Geräteübergabe und AD-Computeranlage haben getrennte Aufgabenregeln. Konkrete Zuweisungen und Ergebnisse bleiben in der Akte.

Statuslinks sind befristete, widerrufbare Leseansichten mit begrenzten Daten. Aufgabenänderungen benötigen interne Anmeldung. Bestehende Ticketlinks bleiben zunächst gültig und erhalten bei Migration 30 Tage Laufzeit.

## Entwicklung und Betrieb

Siehe [SETUP-LOCAL.md](SETUP-LOCAL.md), [OPERATIONS.md](OPERATIONS.md) und [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

```powershell
npm ci
npm run dev
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
```

Node.js mindestens 22.16; geprüft mit 22.23.3. Der Build verwendet vinext/Vite, der Dockerbetrieb Wrangler/Miniflare mit lokalem D1/SQLite-Volume. Windows-Agenten benötigen Windows PowerShell 5.1; produktive Nutzung verlangt HTTPS und ein delegiertes Gatewaykonto.

Prüfnachweise und Grenzen stehen in [TEST-REPORT.md](TEST-REPORT.md). Produktive externe Änderungen, Main-Merge, Push und Serverumstellung benötigen eine gesonderte Freigabe des konkreten Deploymentplans.
