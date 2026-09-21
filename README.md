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
- Live-Ablaufprotokoll während der Ausführung und verständliche Fehler je Arbeitsschritt
- Docker-Betrieb mit lokaler Datenbank, persistentem Volume und Zugriffsschutz
- Windows-Agent, der AD-Zugangsdaten pro Auftrag entgegennimmt und ohne versteckte Dialoge arbeitet
- Hybride Postfachbereitstellung über Entra-Delta-Sync, Microsoft-365-Lizenzprüfung und Exchange Online

## Lokal starten

Siehe [SETUP-LOCAL.md](SETUP-LOCAL.md). Unter Windows genügt nach dem Start von Docker Desktop:

```powershell
PowerShell -ExecutionPolicy Bypass -File .\Start-Local.ps1
```

Die Anwendung ist anschließend standardmäßig unter `http://localhost:8080` erreichbar.

## Eine zentrale Konfiguration

Docker, Windows-Gateway und M365-Verbindungstest lesen gemeinsam die lokale Datei `.env`. Der Einrichtungsassistent erklärt die Herkunft der Werte, übernimmt vorhandene Angaben und erzeugt Web-Kennwort sowie Gateway-Token automatisch:

```powershell
.\Configure-ItLifecycle.ps1
```

Mit `.\Configure-ItLifecycle.ps1 -RotateSecrets` werden Web-Kennwort und Gateway-Token neu erzeugt, während alle anderen Werte erhalten bleiben.

Danach genügen für den Betrieb:

```powershell
.\Update-Server.ps1
.\public\agent\Start-ItLifecycleGateway.ps1
```

Der Gateway fragt nicht mehr separat nach dem Token oder den vier M365-Werten. `.env` bleibt ausschließlich auf dem jeweiligen Rechner und wird von Git ignoriert.

Auf dem Windows-Jobserver muss das Active-Directory-PowerShell-Modul installiert sein. Unter Windows Server geschieht das in einer administrativen PowerShell mit:

```powershell
Install-WindowsFeature RSAT-AD-PowerShell
```

Prüfen lässt sich die Installation mit `Get-Module -ListAvailable ActiveDirectory`.

Für die unbeaufsichtigte Microsoft-365-Anmeldung wird eine Entra-App mit Zertifikat verwendet. Die vollständige Einrichtung und der mitgelieferte Verbindungstest stehen in [public/agent/README.txt](public/agent/README.txt).

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
- AD-Zugangsdaten, die getrennte Windows-Anmeldung für i-net HelpDesk und das nur bei Benutzerneuanlagen benötigte Initialkennwort werden pro Auftrag übergeben, im Gateway sofort aus der Jobdatei entfernt und nur kurzzeitig DPAPI-geschützt an den Agenten weitergereicht. Das Initialkennwort aktiviert das Konto und muss bei der ersten Anmeldung geändert werden.
- Das AD-Konto wird ausschließlich für Active Directory verwendet. Für die HelpDesk-API wird beim echten Lauf ein normales Domänenkonto mit HelpDesk-Rechten separat eingegeben. Beide Kennwörter werden nach dem Lauf verworfen. Für die Übertragung der Zugangsdaten ist HTTPS außerhalb isolierter Tests erforderlich.
- Für den produktiven Betrieb sollte statt Domain Admin ein delegiertes Konto mit den tatsächlich benötigten Rechten verwendet werden.
- Helpdesk-Tickets werden protokolliert, aber mangels bestätigter Storno-API nicht automatisch zurückgenommen.
