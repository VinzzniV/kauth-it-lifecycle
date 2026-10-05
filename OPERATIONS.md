# Aktive lokale HTTP-Testinstallation

Hauptverzeichnis ist ausschliesslich `C:\IT-Lifecycle`, Branch main. Die aktive Revision und das gepinnte Image stehen in der lokalen `.env`; `Status` zeigt den laufenden Stand. Website: `http://PK-SRVJOB001:8080`; Gateway: Port 8788, vom Container ueber `http://host.docker.internal:8788`. Keine Firewall-, DNS- oder Zertifikatsvertrauensaenderungen vorgenommen.

Der Betreiber hat HTTP und `KAUTH\admin.niederwieser` fuer die Testinstallation ausdruecklich freigegeben. Die Anwendung benutzt bestehende Anmeldedaten und unveraenderte Geheimnisse. Die manuelle Aufgabe `Kauth-ITLifecycle-Gateway` laeuft unter dieser angemeldeten Identitaet mit RunLevel Limited, ohne gespeichertes Passwort und ohne Startup-/Logontrigger. Sie ist kein dauerhafter Dienst: nach Windows-Neustart bzw. Abmeldung erneut anmelden und Start ausfuehren. Bei Abmeldung keine laufenden Tests verlieren; vorher Queue abwarten und Stop ausfuehren.

Das Gateway startet immer `work/Test-GatewayEntrypoint.ps1`. Dieser prueft Identitaet, Testmodus, unveraenderten Git-Testadapter und M365-Schluesselzugriff offline und uebergibt den Testadapter ausdruecklich. AD, M365, HelpDesk, Sync und Mailbox werden nur durch lokale Adapter ersetzt; neue Adapter-Effekte sind keine realen Integrationen. **Das normale Gatewayskript nicht direkt ohne TestAdapterPath starten.** Fuer Tests ausschliesslich synthetische Akten/Anmeldedaten verwenden; keine Auftraege fuer vorhandene reale Akten starten, auch kein reales WhatIf.

Eine `.env` unter dem Hauptverzeichnis bleibt die einzige technische Konfiguration. Sie ist fuer SYSTEM, lokale Administratoren und das freigegebene Konto geschuetzt. Neue Queue und Adapterzustand: `C:\ProgramData\Kauth\ITLifecycle\TestV1`. Die unveraenderte alte Queue unter `C:\ProgramData\Kauth\ITLifecycle\Queue` bleibt als Altbestand erhalten und wird nicht eingelesen.

## Betrieb aus PowerShell 7

Diese Befehle explizit mit `pwsh.exe` verwenden. Der Gateway selbst und seine Agenten laufen weiterhin Windows PowerShell 5.1. Die lokalen Betriebswrapper beruecksichtigen die HTTP-Ausnahme, pinnen das Image ueber `.env` und warten nach Taskstart auf Gatewaybereitschaft. Sie veraendern keine systemweite Sicherheitskonfiguration.

```powershell
Set-Location C:\IT-Lifecycle
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Setup
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Check
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Status
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Stop
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Start
```

Setup ist fuer diese Testinstallation idempotent: lokale Datei-/Queue-ACLs und die manuelle Adapteraufgabe pruefen/einrichten. Nicht `Manage -Command Setup -ApplySetup` verwenden: der allgemeine Produktionssetup verlangt HTTPS und wuerde Netz-/HTTP.sys-Regeln einrichten, die hier nicht freigegeben sind. Nicht blind Configure-ItLifecycle ausfuehren: dessen HTTPS-Vorschlaege gelten fuer spaeter. Fuer Start/Update den Wrapper verwenden, weil das allgemeine Update direkt nach Taskstart ohne Bereitschaftswartezeit prueft. PowerShell 7 bewahrt ausserdem die benoetigte Docker-CLI-Argumentquotierung; kein Update unter PS5.1 ausfuehren.

```powershell
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$backup="C:\ProgramData\Kauth\ITLifecycle\Backups\manual-$stamp"
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Backup -BackupDirectory $backup
# Restore geht ausschliesslich in ein NEUES Volume; nicht das aktive Volume angeben.
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Restore -Volume "kauth_manual_restore_$($stamp.Replace('-','_'))" -BackupDirectory "$backup\database"
```

Der Wrapper legt das Backup zugriffsbeschraenkt an und sichert `.env` und die lokalen Testbetriebsskripte getrennt vom konsistenten Datenbankarchiv. Das Datenbankarchiv unter `database` besteht aus database.sqlite und manifest.json. Aktives Datenvolume nach der erfolgreich geprueften Rueckkehr/Umstellung: `kauth_http_v1_return_20261005_122306`; dies steht auch in `.env` und ist der autoritative Backupquellname. Das urspruengliche Volume und alte Images bleiben erhalten. Keine unkontrollierte Volume-Loeschung oder Dateikopie zur Rueckkehr.

## Gepruefte lokale Updates und Rueckkehr

Kein GitHub-Push. Vor Update neue Auftraege auslaufen lassen, Status muss 0 ausstehende Importe melden. Nur bereits gepruefte saubere Gitrevision und passend beschriftetes vorhandenes Image verwenden, `.env`-Releasepin koordiniert aktualisieren; kein impliziter Neubau oder Main-Pull. Der folgende Befehl prueft/aktiviert den aktuellen unveraenderten V1-Stand erneut:

```powershell
$backup="C:\ProgramData\Kauth\ITLifecycle\Backups\update-$(Get-Date -Format yyyyMMdd-HHmmss)"
pwsh.exe -NoProfile -File .\work\Invoke-TestOperation.ps1 -Command Update -BackupDirectory $backup
```

Update prueft Git/Image/Queue/Volume, stoppt Web und Gateway, erstellt Wartungsbackup, migriert und wartet auf Web-/Gatewayhealth. Ein Fehlgate ist keine Freigabe zum Weiterarbeiten: gestoppten Zustand klaeren und mit gesichertem alten Image/Konfiguration aus einem NEU restaurierten Backupvolume zurueckkehren. Eine automatische Rueckkehr wurde beim initialen Deployment tatsaechlich durchlaufen und mit healthy altem Image bestaetigt; der allgemeine Updatewrapper meldet Fehler und ersetzt diese Betreiberentscheidung nicht. Keine externe Wirkung wird durch DB-Restore rueckgaengig gemacht.

Bei spaeterem HTTPS-/Identitaetswechsel den Testwrapper nicht einfach auf echte Aktionen umstellen: Adress-/Zertifikatsvertrauen, delegierte Identitaet und erforderliche Sicherheits-/Netzfreigaben separat festlegen. Reale WhatIf- und Schreibtests benoetigen weiterhin eine gesonderte Freigabe. Zertifikatsschluessel-Restore, externe Backupaufbewahrung und RPO/RTO bleiben fuer den spaeteren Betrieb offen.


## Isolierte UI/UX-Vorschau

Arbeitskopie `C:\IT-Lifecycle\work\ui-ux`, Branch `implementation/ui-ux-audit`. URL `http://PK-SRVJOB001:18081` bzw. lokal `http://localhost:18081`. Port 8080 und dessen Konfiguration/Daten bleiben unverändert. Die Vorschau enthält ausschließlich synthetische Leseansichten; Speichern und Auftragserstellung werden blockiert.

```powershell
Set-Location C:\IT-Lifecycle\work\ui-ux
# Node-22-Werkzeugpfad bei Bedarf nur für diese PowerShell ergänzen.
$env:PATH='C:\IT-Lifecycle\work\tools\node-v22.23.3-win-x64;'+$env:PATH
npm ci
npm run build
docker volume create kauth_ui_ux_preview_data
docker network inspect kauth-ui-ux-isolated
# Nur falls noch nicht vorhanden: docker network create kauth-ui-ux-isolated
docker compose -p kauth-ui-ux -f docker-compose.ui-preview.yml up -d
node tests/ui/verify-browser.mjs
# Vorschau stoppen; Volumes/Belege bleiben erhalten:
docker compose -p kauth-ui-ux -f docker-compose.ui-preview.yml stop
```

Vor erneutem Build laufende Vorschau stoppen, da die Buildartefakte schreibgeschützt eingebunden sind. Beim Update des Testdatendienstes den Vorschaucontainer neu starten. Das Basisimage `kauth/it-lifecycle:v1-http-46968c8` muss lokal vorhanden sein; kein automatischer Main-Pull oder Produktionsupdate. Testimage und Worktree-Mounts sind im [Umsetzungsbericht](UI-UX-IMPLEMENTATION-REPORT.md) beschrieben.

Regressionen: `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`; vorhandene PowerShell-Suiten mit Windows PowerShell 5.1 und den vorgesehenen lokalen Testadaptern. Für den vorhandenen Integrationstest: `TEST_IMAGE=kauth/it-lifecycle:v1-http-46968c8` und `TEST_SOURCE_OVERLAY=1` nur in der aktuellen Prozessumgebung setzen und `node tests/integration/acceptance.mjs` starten. Er erzeugt eigene Volumes/Container auf 18080/18788; keine echten Jobs starten. Für `Run-NativeModuleRegression.mjs` zunächst `node --import tsx tests/ui/export-whatif.ts`, dann den erzeugten synthetischen Pfad `work/whatif-job.json` übergeben.

## Verzeichnis und Unterlagen

README.md ist der Einstieg, OPERATIONS.md die aktuelle Betriebsanleitung. docs/archive enthaelt historische Entwicklungs- und Pruefstaende; docs/planned enthaelt Anforderungen fuer die spaetere HTTPS-/Dienstumstellung. Diese Unterlagen beschreiben keinen aktiven Produktionsbetrieb. Lokale alte Abnahmebelege sind ausserhalb des Repositorys unter C:\ProgramData\Kauth\ITLifecycle\Archives archiviert. work/v1 bleibt die V1-Rueckfallarbeitskopie. work/tools bleibt fuer lokale Entwicklung erhalten. Die drei lokalen Testbetriebsskripte in work bleiben wegen ihrer Task- und Skriptreferenzen an ihrem bisherigen Platz.
