# IT Lifecycle V1 lokal unter Windows

## Voraussetzungen

- Windows 10/11 oder Windows Server mit Docker Desktop beziehungsweise Docker Engine für Linux-Container
- Für die AD-Automation: Windows PowerShell 5.1, RSAT Active Directory und Netzwerkzugriff auf `kauth.local`

## Schnellstart

1. Docker Desktop starten.
2. PowerShell im Projektordner öffnen.
3. `PowerShell -ExecutionPolicy Bypass -File .\Start-Local.ps1` ausführen.
4. Die ausgegebenen Zugangsdaten notieren und `http://localhost:8080` öffnen.

Die Datenbank liegt in einem Docker-Volume und bleibt bei Neustarts oder Image-Updates erhalten.

## AD-Agent für lokale Tests

1. Den Wert `MANAGEMENT_AGENT_TOKEN` aus `.env` kopieren.
2. PowerShell als Administrator öffnen.
3. Falls nötig einmalig die URL reservieren: `netsh http add urlacl url=http://+:8788/ user=Jeder`.
4. `PowerShell -ExecutionPolicy RemoteSigned -File .\public\agent\Start-ItLifecycleGateway.ps1 -ListenPrefix http://+:8788/` starten.
5. Den Token eingeben und das Fenster geöffnet lassen.

Vor Referenzprüfung, WhatIf, Ausführung und Rollback fragt die Weboberfläche nach den AD-Zugangsdaten. Der Gateway wandelt sie sofort in eine mit Windows DPAPI geschützte, temporäre Credential-Datei um. Der Agent liest und löscht diese Datei beim Start; Zugangsdaten werden weder in der Jobdatei noch in Datenbank oder Ergebnis gespeichert. Ohne mitgelieferte Zugangsdaten bleibt die lokale PowerShell-Abfrage als Rückfall erhalten.

Da die Zugangsdaten vom Browser an den Server übertragen werden, muss die Anwendung außerhalb einer isolierten Testumgebung über HTTPS bereitgestellt werden. Für den Regelbetrieb sollte ein delegiertes AD-Konto statt Domain Admin verwendet werden.

## Entwicklung ohne Docker-Neubau

1. Node.js 22 installieren.
2. `npm ci` ausführen.
3. `npm run build` ausführen.
4. Die Migrationen aus `drizzle/` auf die lokale D1-Datenbank anwenden.
5. `npm run dev` starten und die angezeigte lokale Adresse öffnen.

Für einen sauberen Integrationstest empfiehlt sich `Start-Local.ps1`, weil dort dieselbe Laufzeit wie auf der Windows-VM verwendet wird.

## Betrieb und Update

- Status: `docker compose ps`
- Protokoll: `docker compose logs -f it-lifecycle`
- Neustart: `docker compose restart`
- Update aus GitHub: `PowerShell -ExecutionPolicy Bypass -File .\Update-Server.ps1`
- Update ohne Git: `docker compose up -d --build`
- Sicherung: Docker-Volume `kauth_it_lifecycle_data` sichern.

`.env` enthält lokale Geheimnisse und darf nicht ins Git-Repository übernommen werden.

Wenn der Windows-Agent auf demselben Server läuft, müssen nach einem Update auch die aktuellen Dateien aus `public\agent` verwendet werden. Ein bereits geöffnetes Gateway-Fenster anschließend schließen und mit `Start-ItLifecycleGateway.ps1` neu starten.
