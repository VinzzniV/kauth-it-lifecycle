# Kauth IT Lifecycle V1

Interne Anwendung für das Einlesen von HR-Laufkarten, die Bearbeitung manueller Aufgaben und nachvollziehbare Automationen in Active Directory und i-net HelpDesk.

## Enthalten

- Import von CSV-, XLS- und XLSX-Laufkarten
- Filterung auf IT-relevante Positionen; Habel bleibt als definierte Ausnahme enthalten
- Dauerhafte Mitarbeiterakte mit Aufgaben, Systemen und Ereignissen
- Active-Directory-Vorschau mit expliziter Ziel-OU
- Referenzbenutzer für die Übernahme direkter Gruppenmitgliedschaften
- Automatische AD-Computerplanung nach Standort und Gerätetyp
- WhatIf, echte Ausführung, Ergebnisprotokoll und gezielter Rollback
- Docker-Betrieb mit lokaler Datenbank, persistentem Volume und Zugriffsschutz
- Windows-Agent, der Zugangsdaten ausschließlich lokal abfragt

## Lokal starten

Siehe [SETUP-LOCAL.md](SETUP-LOCAL.md). Unter Windows genügt nach dem Start von Docker Desktop:

```powershell
PowerShell -ExecutionPolicy Bypass -File .\Start-Local.ps1
```

Die Anwendung ist anschließend standardmäßig unter `http://localhost:8080` erreichbar.

## Entwicklung

```powershell
npm ci
npm run build
npm run dev
```

Die produktionsnahe lokale Prüfung erfolgt über `docker compose up -d --build`.

## Sicherheit

- `.env` enthält Geheimnisse und ist von Git ausgeschlossen.
- AD- und Helpdesk-Kennwörter werden nicht an die Webanwendung übertragen oder gespeichert.
- Für den produktiven Betrieb sollte statt Domain Admin ein delegiertes Konto mit den tatsächlich benötigten Rechten verwendet werden.
- Helpdesk-Tickets werden protokolliert, aber mangels bestätigter Storno-API nicht automatisch zurückgenommen.
