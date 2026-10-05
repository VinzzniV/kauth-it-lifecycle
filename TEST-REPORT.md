# V1: Testnachweise

Stand 05.10.2026: vollstaendige isolierte Abnahmekette bestanden. Keine produktive Umstellung. Arbeitsbranch `implementation/v1-isolated`, Worktree `C:\IT-Lifecycle\work\v1`; Ausgangsrevision `16755f9d259ecf0725f03462e319fd780dce9154` entspricht dem lesend abgefragten `origin/main`.

## Reproduzierbare Pruefungen

| Pruefung | Ergebnis |
|---|---|
| Windows/Linux Installation | `npm ci` mit Lockdatei bestanden; Node22.23.3 portabel, offizielle ZIP/SHA256 geprueft |
| Build / Typecheck / Lint | Docker-Neubau mit allen5 vinext/Vite-Phasen, `npx tsc --noEmit`, vollstaendiges ESLint bestanden; Buildhinweis zu grossen Chunks bleibt |
| Node-Regressionen | 29/29 bestanden:19 Import/Planung,4 Ergebnisvertraege,6 SQLite/Persistenz/Backup |
| Windows PowerShell5.1 Agent | 20/20 mit lokalen Adaptern bestanden: alle Jobarten, fruehe Fehler/Cleanup, Freigabe/WhatIf, Gruppen/Computer, M365-Teilfehler/Retry, Ticketunsicherheit, GUID/Konfliktruecknahme, Wechsel/Offboarding |
| Windows PowerShell5.1 Gateway | 11/11 bestanden: Annahme/Deduplizierung, Callbackretry, Neustart/lebender Kindprozess, verlorener Prozess, Crash-Recovery, abgebrochener HTTP-Client und sichere Fehler |
| Konfiguration / Betrieb | 3 Konfigurations- und6 Betriebsfaelle bestanden: ACL/Schluesselerhalt, explizite gemeinsame .env, vorbereitendes Setup, fruehe Update-/Restore-Ablehnung |
| Native Module | Node reproduziert PS7-Modulpfadfehler in PS5.1; korrigierter Bootstrap besteht echte HTTP-Uebergabe mit3 Credentials, Konfiguration und20 Agentfaelle unter diesem geerbten Pfad |
| HTTPS / Logs | Caddy-Konfiguration validiert; echte HTTPS-Health200 mit lokaler Test-CA ohne deaktivierte Zertifikatspruefung. Erzwungener502 redigiert Status-URI/Requestheader |
| Unabhaengige Pruefung |5 bestaetigte Integrationsbefunde korrigiert und erneut geprueft; abschliessender Delta-Review ohne neue bestaetigte Fehler,6 Persistenztests und PowerShellparser unabhaengig bestanden |

PowerShellversion `5.1.20348.5622`, PS7 `7.6.6`, Git2.55.0, Codex0.160.0, Docker29.8.0/Compose5.5.1 und installierter Edge. Keine systemweiten Sicherheitsmechanismen geaendert.

## Vollstaendige Abnahmekette

`node tests/integration/acceptance.mjs` bestand auf unveraenderlichem Image `sha256:71b0eeb75b431300ba717299b6bf698d4704afccad6d39737c9a3f0eb45a1c68`. Beleg: [acceptance.json](work/v1-1791189535470/acceptance.json); dazu `mobile.png`, `employee-desktop.png`, eigene Queue und Backupmanifest im selben Verzeichnis.

- Echter Edge-Browser importiert UTF8-HR-Datei mit Umlauten; fuenf Ansichten bei390px ohne Ueberlauf. XLS/XLSX/CP1252/Quoting/Wechsel/Datumswerte zusaetzlich im Regressionstest.
- WhatIf gespeichert, null externe Adaptermutationen und keine Aufgabe erledigt.
- Execute mit Lizenzmangel; Browser geschlossen, Gateway waehrend laufendem Kindprozess neu gestartet; authentifiziertes Teilergebnis dauerhaft gespeichert. Gleicher Start/doppelte Ergebnisse idempotent, konkurrierender Start und manipulierte Mitarbeiterzuordnung abgewiesen.
- Ausschliesslich fehlgeschlagene M365-Aktion wiederholt; kein doppelter Benutzer/Computer/Ticket. E-Mail-Aufgabe erst nach bestaetigtem Testpostfach erledigt.
- Manuelle Aufgaben im internen Browser erledigt; abgeschlossener Vorgang verschwindet aus offener Uebersicht, Akte/Tabs/Historie bleiben erhalten. Oeffentliche Ansicht begrenzt/lesend und widerrufbar.
- WhatIf-Ruecknahme ohne Wirkung; Execute nimmt unterstuetzte Benutzer-/Computer-Aenderungen per GUID zurueck. Separate Agentfaelle pruefen Konflikte; Tickets/M365 bleiben ausdruecklich manuell.
- Wechselimport behaelt Akte und Historie, setzt geaenderte Referenzpruefung zurueck. Stammdatendeaktivierung behaelt Regelidentitaet; fehlerhafte API-Anfragen liefern400.
- Authentifizierter Callback vor15s-Uebergabetimeout behaelt den abgeschlossenen Lauf und gefundenen Referenzstatus trotz spaeter HTTP-Fehlermeldung.
- Konsistentes Backup in separates Volume restauriert: `quick_check=ok`,1 Akte,7 Receipts. Restaurierte Webapp startet, liefert dieselbe Akte mit2 Vorgaengen und gefundenem Referenzstatus. Token-/Passwortpruefung der Weblogs ohne Treffer.

Testvolumes `it_lifecycle_v1-1791189535470` und `_restored` bleiben als Belege erhalten; Testcontainer wurden gestoppt. Keine produktive Datenbank/Queue wurde eingebunden. Ein erster Restore-Prueflauf scheiterte am schreibgeschuetzten WAL-Testmount; Zielmount und Testprozess-Cleanup korrigiert, komplette Kette danach erneut gruen.

Ein zusaetzlicher gestoppter Quellvolume-Test bestaetigte einen SQLite-Lockfehler am read-only Mount. Die Betriebs-Sicherung erlaubt jetzt Lockdateien bei weiterhin lesender Datenbankverbindung; der finale Releaselauf prueft echte Manage-Backup-/Restorebefehle nach Webstop. Das Archiv ist durch DELETE-Journal am Sicherungsziel selbststaendig; Restore wird aus genau manifest.json und database.sqlite im schreibgeschuetzten Backupmount geprueft. Die erwartete Docker-Meldung bei fehlendem Restorevolume war unter PS5.1 terminierend; sichere Volumenliste ersetzt diesen Fehlerpfad. Positiver Restore und Ablehnung eines bestehenden Volumes sind separat bestanden.

Ein frueher Klick auf den serverseitig schon sichtbaren Importknopf ging vor Hydration verloren. Der Knopf bleibt bis zum Ende der initialen Ladephase deaktiviert; Typecheck und Lint bestanden. Die finale Browserkette prueft den normalen Import erneut.

Die konkrete Releaseidentitaet steht nach dem abschliessenden, mit Git-SHA gekennzeichneten Neubau in [work/release.json](work/release.json). Deployment darf nur dessen exakt benanntes Image und Revision mit erneut bestandenem Abnahmelauf verwenden; Kandidatentag allein genuegt nicht.

Weitere PS5.1-Belege unter `%TEMP%`: `it-lifecycle-ps-d61d1a2b5c3346ce9e8f266b45270413`, `it-lifecycle-gateway-2f4e01bef9694d21b7579d9a3128789d`, `it-lifecycle-config-007ed02b796440479b690d65be4b9152`, `it-lifecycle-ops-7b0501fd30c44cba881ceafec85089ed`, `it-lifecycle-envelope-21097d03d36e4088a733449caaa9a640`.

## Grenzen und Produktionsschutz

Reales AD wurde lesend abgefragt; Graph-/Exchange-Anmeldung mit vorhandenem Zertifikat am05.10.2026 erfolgreich,2 freie SPB. HelpDesk8002 und ADSync5985 per TCP erreichbar. Diese Nachweise bestaetigen weder Schreibrechte noch reale Benutzer-/Postfach-/Ticketbereitstellung. Alle Ausfuehrungswirkungen stammen aus lokalen Testadaptern; HR-Layouts sind synthetisch.

Produktiver Container `595f34094917ba7f3cad25677a5e600bc951153ddb0cfa0416cf66e35b63a042`, Image `sha256:8b150f01af324b5433c5f2b188a11efc306d782dbcea85cbef8f021d6391c5b8`, Volume `kauth_it_lifecycle_data` bleiben unveraendert/gesund. Kein Main-Merge/Push, keine AD-/M365-/HelpDesk-Mutation, Lizenzvergabe oder produktive Loeschung. Veroeffentlichbare Dateien wurden ohne Ausgabe der Geheimnisse gegen produktives APP_PASSWORD/Gatewaytoken geprueft: keine Treffer; keine privaten Schluessel im Commit/Buildkontext.

Delegierte Dienstidentitaet, reale Schreibrechte, Zertifikatszugriff unter dieser Identitaet, DNS/CA-Vertrauen, freigegebene Netze, Wartungsfenster und Backupaufbewahrung sind vor Aktivierung festzulegen. Die bisherigen gemeinsamen internen Zugangsdaten bleiben V1; individuelle SSO/RBAC ist bewusst verschoben. [Deployment und Rueckkehr](DEPLOYMENT-PLAN.md), [Betrieb](OPERATIONS.md), [Auditzuordnung](AUDIT-DISPOSITION.md).
