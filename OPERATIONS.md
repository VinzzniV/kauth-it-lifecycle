# Aktive Hauptinstallation

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


## Login und aktueller Release

Die Hauptinstallation unter **http://PK-SRVJOB001:8080** enthält die UI/UX-Änderungen, die neue Login-Seite und die angepasste Betriebsdiagnose. Releaseimage: `kauth/it-lifecycle:ui-login-20261008`; die genaue Revision steht in `.env`, im Imagelabel und unter Diagnose. Hauptverzeichnis bleibt `C:\IT-Lifecycle`, Branch main. Die vorherige Revision `46968c8b3c9b5e93b0e8ca48b34d53eb10b59abc` und das Image `kauth/it-lifecycle:v1-http-46968c8` bleiben für die Rückkehr erhalten.

Anmeldung mit den bestehenden `.env`-Zugangsdaten. Signiertes HttpOnly-/SameSite-Lax-Cookie, acht Stunden Laufzeit, Secure bei konfigurierter HTTPS-Adresse. Passwortwechsel macht vorhandene signierte Sitzungen ungültig. Abmelden entfernt das Cookie aus diesem Browser; eine außerhalb des Browsers kopierte Sitzung bleibt bis Ablauf oder Passwortwechsel gültig. Basic bleibt für explizite API-Clients kompatibel; der Browser erhält keine Basic-Passwortaufforderung mehr. Gateway-Ergebnisse verlangen weiterhin ausschließlich den Gateway-Bearer. Anmeldung und Änderungen mit Sitzungscookie prüfen den Ursprung der Anfrage. Die lokale Anmeldebegrenzung gilt pro laufender Workerinstanz und wird bei Neustart zurückgesetzt.

Backups vor der Übernahme: `C:\ProgramData\Kauth\ITLifecycle\Backups\ui-login-preflight-20261008` und `ui-login-maintenance-20261008`. Datenvolume und Geheimnisse bleiben erhalten. Der bestehende HTTP-/Testadapterbetrieb wird durch das UI-Deployment nicht auf echte externe Ausführung umgestellt.

Das unveränderliche Releaseimage enthält die geprüften Buildartefakte ohne Worktree-Mounts. `Dockerfile.release` übernimmt Node und Abhängigkeiten aus dem bereits geprüften Basisimage. Dessen vor dem Build geprüfte Image-ID: `sha256:ebd4c7a269417289c5cd8637c1e57d9a8f2ecda62974654fb03ec67396c8e2f1`. Der Standard-Dockerfile bleibt für vollständige Builds verfügbar.

```powershell
Set-Location C:\IT-Lifecycle
$env:PATH='C:\IT-Lifecycle\work\tools\node-v22.23.3-win-x64;'+$env:PATH
npm ci
npm run build
$revision=git rev-parse HEAD
# Für einen weiteren Release einen neuen Image-Tag verwenden.
docker build -f Dockerfile.release --build-arg "GIT_REVISION=$revision" -t kauth/it-lifecycle:NEUER-RELEASE .
```

Die Vorschaucontainer `kauth-ui-ux-preview` und `kauth-ui-ux-data` sowie deren ausschließlich synthetisches Volume `kauth_ui_ux_preview_data` und eigenes Netz `kauth-ui-ux-isolated` sind entfernt. Port 18081/18082 ist nicht mehr aktiv. Screenshot-/Testbelege und der Entwicklungsworktree bleiben erhalten. `docker-compose.ui-preview.yml` ist nur eine historische bzw. optionale Entwicklungsdefinition; kein Bestandteil des Hauptbetriebs.

Regressionen: `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`; vorhandene PowerShell-Suiten mit Windows PowerShell 5.1 und den vorgesehenen lokalen Testadaptern. Für den vorhandenen Integrationstest: `TEST_IMAGE=kauth/it-lifecycle:v1-http-46968c8` und `TEST_SOURCE_OVERLAY=1` nur in der aktuellen Prozessumgebung setzen und `node tests/integration/acceptance.mjs` starten. Er erzeugt eigene Volumes/Container auf 18080/18788; keine echten Jobs starten. Für `Run-NativeModuleRegression.mjs` zunächst `node --import tsx tests/ui/export-whatif.ts`, dann den erzeugten synthetischen Pfad `work/whatif-job.json` übergeben.

## Verzeichnis und Unterlagen

README.md ist der Einstieg, OPERATIONS.md die aktuelle Betriebsanleitung. docs/archive enthaelt historische Entwicklungs- und Pruefstaende; docs/planned enthaelt Anforderungen fuer die spaetere HTTPS-/Dienstumstellung. Diese Unterlagen beschreiben keinen aktiven Produktionsbetrieb. Lokale alte Abnahmebelege sind ausserhalb des Repositorys unter C:\ProgramData\Kauth\ITLifecycle\Archives archiviert. work/v1 bleibt die V1-Rueckfallarbeitskopie. work/tools bleibt fuer lokale Entwicklung erhalten. Die drei lokalen Testbetriebsskripte in work bleiben wegen ihrer Task- und Skriptreferenzen an ihrem bisherigen Platz.
