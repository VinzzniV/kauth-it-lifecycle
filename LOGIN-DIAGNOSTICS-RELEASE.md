# Login, Betriebsdiagnose und Übernahme

Auftrag vom 08.10.2026: Login-Seite ergänzen, Betriebsdiagnose an die Anwendung anpassen, anschließend die isolierte Vorschau entfernen und den geprüften Stand in der Hauptinstallation starten.

## Bedienung

Login unter `/login`: bestehende Zugangsdaten, deutschsprachige Fehlermeldung, Passwortanzeige, Passwortmanager-Unterstützung, Tastaturbedienung und Rückkehr zur ursprünglich angeforderten Ansicht. Auf Mobilgeräten stehen Marke und Formular im Vordergrund. Abmelden ist im Kopf der internen Ansichten verfügbar; abgelaufene Sitzungen führen erneut zum Login.

Betriebsdiagnose unter `/diagnose`: dieselbe Seitenleiste und mobile Navigation, Statuskarten für Datenbank, Gateway und Anmeldung, Zeitpunkt der letzten Prüfung, Aktualisieren, offene Aufträge und installierte Revision. **Zur Übersicht** ist als Button sichtbar; **Zu den Automationen** führt zu den Aufträgen. Fehler und ältere Prüfergebnisse werden ausdrücklich gekennzeichnet. Die Navigation lädt das Dokument neu, damit der Zugriffsschutz erneut geprüft wird und zwischengespeicherte Router-Weiterleitungen nicht verwendet werden.

## Zugriffsschutz

Keine neuen Zugangsdaten oder Geheimnisse. Server prüft die bisherigen `.env`-Anmeldedaten und stellt ein HMAC-SHA-256-signiertes Cookie mit zufälligem Sitzungswert, acht Stunden Laufzeit, HttpOnly und SameSite=Lax aus. Secure wird anhand der konfigurierten HTTPS-Adresse gesetzt. Cookie enthält keine Zugangsdaten. Passwortwechsel entwertet vorhandene Signaturen. Abmelden löscht die Browsersitzung; eine vorher kopierte Sitzung wird serverseitig nicht separat widerrufen und läuft spätestens nach acht Stunden ab. Keine Sitzung in localStorage.

Login verlangt JSON und einen gültigen Ursprung. Änderungen mit Sitzungscookie verlangen ebenfalls den Ursprung; fremde Browserursprünge werden auch bei Basic-Anfragen zurückgewiesen. Explizite Basic-API-Clients bleiben kompatibel. Interne APIs antworten ohne Anmeldung mit 401, interne Seiten leiten auf das Formular weiter. Öffentliche Statuslinks und Health bleiben unverändert. Der Gateway-Ergebniseingang akzeptiert weiterhin ausschließlich den Gateway-Bearer, niemals ein Benutzer-Cookie. Zehn fehlgeschlagene Anmeldungen pro Minute begrenzen weitere Versuche in der laufenden Workerinstanz; Neustart setzt diese lokale Begrenzung zurück.

Technische Referenz: [Cookie-Attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [Web-Crypto-Signaturprüfung](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify).

## Prüfung

- `npm ci` mit unveränderter Lockdatei; 44 Tests erfolgreich, TypeScript-Prüfung, Lint und Build erfolgreich.
- Bestehender Integrationstest: 12 Prüfungen einschließlich echter Formularanmeldung, interner Cookie-Mutationen, authentifiziertem Ergebnisimport, Wiederholung, WhatIf/Execute-Rücknahme sowie Backup/Restore. Ausschließlich synthetische Akten und isolierte Adapter/Volumes. [Beleg](docs/ui-ux/login-diagnostics/integration-evidence.json).
- Bestehende UI/UX-Browserprüfung bei 1440×900, 1280×720 und 390×844 bestanden. Aktualisierte Screenshots und [Beleg](docs/ui-ux/browser-evidence.json).
- Gezielte Login-/Diagnoseprüfung bei denselben drei Größen: echte Tab-/Enter-Bedienung, falsches Passwort, Passwortanzeige, Rückkehr zur ursprünglichen Seite, Status/Refresh/Gatewayausfall, Fehler mit vorherigen Werten, Rücknavigation, Logout, Zugriff nach Logout. APIs prüfen Signaturmanipulation, Ursprungsschutz, Gatewaytrennung und Begrenzung fehlgeschlagener Versuche. Keine Browserfehler. [Beleg](docs/ui-ux/login-diagnostics/evidence.json).

| Ansicht | Desktop | Laptop | Mobil |
|---|---|---|---|
| Login | [1440](docs/ui-ux/login-diagnostics/login-1440.png) | [1280](docs/ui-ux/login-diagnostics/login-1280.png) | [390](docs/ui-ux/login-diagnostics/login-390.png) |
| Diagnose | [1440](docs/ui-ux/login-diagnostics/diagnose-1440.png) | [1280](docs/ui-ux/login-diagnostics/diagnose-1280.png) | [390](docs/ui-ux/login-diagnostics/diagnose-390.png) |

Buildhinweise zur bestehenden Paketgröße und statischen Routenklassifikation bleiben unverändert. Kein Schemawechsel, keine Änderungen an Agenten oder Automationsverträgen. Die externe AD-/M365-/HelpDesk-Ausführung wurde nicht verändert oder mit realen Objekten getestet.

## Übernahme und Rückkehr

Hauptinstallation: **http://PK-SRVJOB001:8080**, Verzeichnis `C:\IT-Lifecycle`, Branch main. Releaseimage `kauth/it-lifecycle:ui-login-20261008`, Revision über `.env`, Imagelabel und Diagnose prüfbar. Der Implementierungsbranch wird lokal per Fast-forward übernommen; kein Push. Das Releaseimage enthält die geprüften Artefakte unveränderlich, ohne Entwicklungs-Mounts. Laufzeitabhängigkeiten stammen aus dem zuvor vorhandenen und anhand seiner Image-ID geprüften Basisimage; `Dockerfile.release` und eigener begrenzter Buildkontext verhindern den Einbau von `.env`, Datenbank oder Testartefakten.

Vorheriger Stand: Revision `46968c8b3c9b5e93b0e8ca48b34d53eb10b59abc`, Image `kauth/it-lifecycle:v1-http-46968c8`. Sicherungen: `C:\ProgramData\Kauth\ITLifecycle\Backups\ui-login-preflight-20261008` und `ui-login-maintenance-20261008`, jeweils konsistente geprüfte Datenbank plus separat geschützte Konfiguration. Der Betriebswrapper prüft Revision/Image/Queue/Volume vor der Umstellung; Health und interner lesender Zugriff werden anschließend geprüft.

Das bisherige Volume `kauth_http_v1_return_20261005_122306` bleibt aktiv. Tabellenprüfsummen vor/nach der Übernahme prüfen den Erhalt aller Anwendungsdaten. Konfiguration wird nur bei `GIT_REVISION` und `RELEASE_TAG` aktualisiert; vorhandene Geheimnisse, ACL, Adressen, Gatewayidentität und Testadapter bleiben erhalten. Die Übernahme betrifft die Hauptinstallation; reale Integrationen werden dadurch nicht aktiviert.

Nach erfolgreicher Übernahme werden die Vorschaucontainer `kauth-ui-ux-preview` und `kauth-ui-ux-data`, deren eigenes synthetisches Volume `kauth_ui_ux_preview_data` und das ausschließlich von ihnen verwendete Netz `kauth-ui-ux-isolated` entfernt. Aktenvolume, vorige Images, Backups, Screenshots und übrige Testbelege bleiben erhalten.

Für eine Rückkehr die aktuelle Queue auslaufen lassen und mit dem Betriebswrapper stoppen. Die Hauptarbeitskopie auf die oben genannte vorherige Revision umstellen und die gesicherte `.env` mit vorherigem Releasepin wiederherstellen; dann den Startwrapper benutzen. Falls ein DB-Restore benötigt wird, mit `Restore` ein **neues** Volume aus dem Wartungsbackup erzeugen und dieses ausdrücklich konfigurieren. Das aktive Volume niemals überschreiben. Ein DB-Restore nimmt keine externe Wirkung zurück. Betriebsbefehle: [OPERATIONS.md](OPERATIONS.md).
