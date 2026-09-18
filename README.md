# Kauth IT Lifecycle V1

Interne Anwendung für das Einlesen von HR-Laufkarten, die Bearbeitung manueller Aufgaben und nachvollziehbare Automationen in Active Directory und i-net HelpDesk.

## Enthalten

- Import von CSV-, XLS- und XLSX-Laufkarten
- Filterung auf IT-relevante Positionen; Habel bleibt als definierte Ausnahme enthalten
- Dauerhafte Mitarbeiterakte mit Aufgaben, Systemen und Ereignissen
- Active-Directory-Vorschau mit expliziter Ziel-OU
- Referenzbenutzer für die Übernahme direkter Gruppenmitgliedschaften
- AD-Prüfung des Referenzbenutzers mit gespeicherter Ziel-OU und manueller Wiederholungsprüfung
- Automatische AD-Computerplanung nach Standort und Gerätetyp
- WhatIf, echte Ausführung, Ergebnisprotokoll und gezielter Rollback
- Docker-Betrieb mit lokaler Datenbank, persistentem Volume und Zugriffsschutz
- Windows-Agent, der AD- und HelpDesk-Zugangsdaten pro Auftrag entgegennimmt und ohne versteckte Dialoge arbeitet

## Lokal starten

Siehe [SETUP-LOCAL.md](SETUP-LOCAL.md). Unter Windows genügt nach dem Start von Docker Desktop:

```powershell
PowerShell -ExecutionPolicy Bypass -File .\Start-Local.ps1
```

Die Anwendung ist anschließend standardmäßig unter `http://localhost:8080` erreichbar.

Auf dem Windows-Jobserver muss das Active-Directory-PowerShell-Modul installiert sein. Unter Windows Server geschieht das in einer administrativen PowerShell mit:

```powershell
Install-WindowsFeature RSAT-AD-PowerShell
```

Prüfen lässt sich die Installation mit `Get-Module -ListAvailable ActiveDirectory`.

## Entwicklung

```powershell
npm ci
npm run build
npm run dev
```

Die produktionsnahe lokale Prüfung erfolgt über `docker compose up -d --build`.

## Installation und Updates über GitHub

Das Repository ist für den privaten Betrieb vorgesehen. Auf dem Server wird es einmal geklont und danach mit folgendem Befehl aktualisiert:

```powershell
git clone https://github.com/VinzzniV/kauth-it-lifecycle.git
cd kauth-it-lifecycle
Copy-Item .env.example .env
# .env anschließend mit sicheren lokalen Werten befüllen
PowerShell -ExecutionPolicy Bypass -File .\Update-Server.ps1
```

Das Update lädt ausschließlich freigegebene Änderungen, baut das Docker-Image neu und startet den Container. Die nicht versionierte `.env` und das Datenbank-Volume bleiben bestehen.

## Sicherheit

- `.env` enthält Geheimnisse und ist von Git ausgeschlossen.
- AD- und HelpDesk-Zugangsdaten werden pro Auftrag übergeben, im Gateway sofort aus der Jobdatei entfernt und nur kurzzeitig DPAPI-geschützt an den Agenten weitergereicht. Für diesen Weg ist HTTPS außerhalb isolierter Tests erforderlich.
- Für den produktiven Betrieb sollte statt Domain Admin ein delegiertes Konto mit den tatsächlich benötigten Rechten verwendet werden.
- Helpdesk-Tickets werden protokolliert, aber mangels bestätigter Storno-API nicht automatisch zurückgenommen.
