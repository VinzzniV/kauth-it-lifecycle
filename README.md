# Kauth IT Lifecycle V1

Eine Webanwendung mit lokaler SQLite-Datenbank und Windows-Gateway für HR-Laufkarten, Mitarbeiterakten, Aufgaben und freigegebene AD-/M365-/HelpDesk-Aktionen.

## Arbeitsablauf

Akten unterscheiden Vorgangsstatus, Aufgabenfortschritt, dokumentierten Bestand und letzten Automationslauf. „Beantragt“ und „Freigegeben“ bestätigen keine Bereitstellung. Ergebnisse stehen vor eingeklappten Planungsdetails; Aufgaben starten mit „Offen“. Referenzprofile sind Metadaten, historische Einträge bleiben erhalten. Freigabe nennt den konkreten Umfang, Rücknahme zeigt unterstützte Schritte und verbleibende manuelle Arbeit.

UI/UX-Änderungen und Testbelege: [UI-UX-IMPLEMENTATION-REPORT.md](UI-UX-IMPLEMENTATION-REPORT.md). Login, Betriebsdiagnose und Übernahme in die Hauptinstallation: [LOGIN-DIAGNOSTICS-RELEASE.md](LOGIN-DIAGNOSTICS-RELEASE.md). Die frühere isolierte Vorschau ist entfernt.

Der interne Bereich startet mit einer Login-Seite. Bestehende Zugangsdaten bleiben gültig; die Sitzung läuft nach acht Stunden ab. Über **Abmelden** wird die Browsersitzung beendet. Die **Betriebsdiagnose** zeigt Datenbank, Gateway, Anmeldeschutz und offene Aufträge; **Zur Übersicht** führt zurück.

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

Aktuelle Testinstallation: **http://PK-SRVJOB001:8080**, Hauptverzeichnis **C:\IT-Lifecycle**. Setup, Start, Stop, Status, Update, Backup und Restore sind in [OPERATIONS.md](OPERATIONS.md) beschrieben. HTTP und das vorhandene Gatewaykonto sind fuer diesen Testbetrieb freigegeben; externe Systeme werden ausschliesslich durch isolierte Testadapter ersetzt.

```powershell
npm ci
npm run dev
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
```

Node.js mindestens 22.16; geprüft mit 22.23.3. Der Build verwendet vinext/Vite, der Dockerbetrieb Wrangler/Miniflare mit lokalem D1/SQLite-Volume. Windows-Agenten benötigen Windows PowerShell 5.1; produktive Nutzung verlangt HTTPS und ein delegiertes Gatewaykonto.

Historische Entwicklungsplaene, Audits und Pruefberichte stehen in [docs/archive](docs/archive/README.md). Anforderungen fuer die spaetere HTTPS-/Dienstumstellung stehen in [docs/planned](docs/planned/README.md). V1 ist lokal installiert; reale externe Automationen sind noch nicht erfolgreich getestet oder freigegeben. Ein GitHub-Push ist nicht freigegeben.
