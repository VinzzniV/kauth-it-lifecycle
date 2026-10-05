 > Historischer Stand beziehungsweise Plan fuer spaeteren HTTPS-Betrieb. Aktuelle Testbetriebsanleitung: [OPERATIONS.md](../../OPERATIONS.md).

# Zuordnung der Auditbefunde

Ausgangsaudit: AUDIT-REPORT.md vom02.10.2026, Revision16755f9. Befunde wurden gegen den vorhandenen Code und die aktuelle Umgebung geprueft. Abnahmenachweise stehen in TEST-REPORT.md; produktive Aktivierung ist nicht erfolgt.

| Befund | Zuordnung | Umsetzung / Grenze |
|---|---|---|
| R01 lokale Geheimnisrechte | behoben im Setup; Aktivierung extern blockiert | Neue Konfiguration restriktiv; bestehende ACLs im expliziten Setupplan. Bestehende Geheimnisse nicht rotiert. |
| R02 HTTP/Firewall | behoben vorbereitet; produktive PKI/Firewall extern blockiert | Web-Loopback, HTTPS-Profil und Gatewaypflicht; begrenzte additive Regeln. HelpDesk-TLS braucht freigegebenen Zielendpunkt. Firewallprofile/RDP/WinRM nicht blind geaendert. |
| R03 Queuevertrauen | behoben | Restriktiver Setupplan, produktiver ACL-Startcheck, exklusiver Queue-Lock, atomare Dateien, gebundene Ergebnisse. |
| R04 Gateway/PS5.1-Defaultpfad | behoben | Pfade nach Parametern; geplante Aufgabe mit definierter Identitaet vorbereitet; isolierter echter Gatewaybetrieb getestet. Produktionsstart bleibt freigabepflichtig. |
| R05 actionfreie Jobs/fruehes Cleanup | behoben | Operationsvertraege und kontrollierte fruehe Ergebnisse/Cleanup, einschliesslich null/Skalar/Array und JSON-Fehler. |
| R06 WhatIf-Ruecknahme/zu breite Aufgaben | behoben | Keine echten Statusaenderungen bei WhatIf; Aufgaben/Ausstattung an unterstuetzte tatsaechliche Ruecknahmen gebunden. |
| R07 Objektidentitaet/Konflikte | behoben | GUIDs und erwarteter Zustand; Konflikt bleibt sichtbar/manuell. M365/Tickets haben keinen automatischen Ruecknahmeweg. |
| R08 Freigabe/Dokumentationsvertrag | behoben | Sicherer WhatIf-Default; explizites Execute-Flag; kein behaupteter Confirm-Schalter. Download ist reine Vorschau, kein alternativer Mutationseinstieg. |
| R09 Browser als Ergebnisquelle | behoben | Browserimport gesperrt; authentifizierter Gatewaycallback gegen gespeicherten Job/Mitarbeiter/Modus/Aktion. |
| R10 Idempotenz/Konkurrenz | behoben | Atomare Akten-/Einzelaktionsclaims, unveraenderliche Receipts; Retry nur nachweislich fehlgeschlagener Aktion. Unsicherer Ticket-/Mutationseffekt erfordert Pruefung. |
| R11 Excelparser | behoben | SheetJS0.20.3 vom offiziellen CDN, Lockintegritaet; XLS/XLSX-Regressionskorpus und10MB-Grenze. Kein HTML-Rendering aus Arbeitsmappen. |
| R12 oeffentliche Schreib-Tokens/Logs | behoben | Nur begrenzte Leseansicht,30Tage, Widerruf/Rotation, no-store/no-referrer, Web- und Proxyfehlerlog-Redaktion. Bestehende Links erhalten mit Migrationsablauf. |
| R13 Backup/Restore | behoben und getestet | Native konsistente SQLite-Sicherung, Hash/Integritaet, neues Zielvolume. Schluessel-/Konfigurationsbackup und RPO/RTO als Betreiberentscheidung dokumentiert. |
| R14 CSV/Wechsel/Datum | behoben | UTF8/BOM/CP1252, Quoting, Wechselklassifikation, strikte Kalenderdaten, Datezellen ohne Tagesverschiebung. |
| R15 nichtatomarer Import/Ergebnisse | behoben | Atomare Batches, Inhaltsdigest und Ereigniszuordnung; GET schreibfrei; doppelte Receipts idempotent; Historie erhalten. |
| R16 Browser-/Gatewayausfaelle | behoben | Persistente Queue, Callbackretry, lebende PID+Startzeit beobachten, nie gestartete Annahmen wiederaufnehmen, unbekannter Prozessausgang pruefpflichtig;15s-Dispatchtimeout. |
| R17 Stammdaten/Status/Historie | behoben | Stammdaten beeinflussen tatsaechliche Jobs einschliesslich manueller Regeln; Auditverlauf, Serviceprojektion, Eventabschluss und Bestandsmigration. Externe Offboardingzugriffe bleiben manuell. |
| R18 mobile Navigation/Overflow | behoben | Mobile Links, min-width:0/Umbruch/Scrollbereiche; reale390px-Abnahme aller5 Ansichten bestanden. |
| R19 Fehler/Laden/Validierung | behoben | Verstaendliche400, endlich beendete Fehlerzustaende, sichere Formulardrafts/Tabwechsel, oeffentliche Seite rein lesend. |
| R20 Rechte/Kontenmodell | geprueft; externe Rechte extern blockiert; persoenliche Webkonten bewusst verschoben | Vorhandene Graph/Exchange-Anmeldung lesend geprueft. Delegationen/Zertifikatsrechte unter geplanter Dienstidentitaet vor Deployment nachweisen. V1 behaelt vorhandene interne gemeinsame Anmeldung; individuelle SSO/RBAC ist kein neues V1-System. |
| R21 Zielgrenze/Passthrough | behoben | Browser liefert Akten-ID/zulassige Auswahl, Server rekonstruiert Regeln; erlaubte Aktionen, Domain-/Hostgrenze aus zentraler Konfiguration, Callbackziel nicht clientwaehlbar, GUID-Besitz und Groessenlimits. |

Keine produktiven AD-/M365-/HelpDesk-Aktionen, Lizenzvergabe, Loeschung, Main-Merge oder Push vorgenommen. Synthetische Testlayouts beweisen die erhaltenen Layoutregeln; noch unbekannte reale HR-Varianten sind damit nicht pauschal bestaetigt. PKI, delegierte Dienstidentitaet und reale Schreibrechte bleiben konkrete Deploymentgates.

Parserbezugsquelle: https://docs.sheetjs.com/docs/getting-started/installation/frameworks/ und https://cdn.sheetjs.com/advisories/CVE-2024-22363 (am05.10.2026 geprueft). SQLite-Mindestversion/Backup: https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html . Caddy-Logfilter: https://caddyserver.com/docs/caddyfile/options und /docs/caddyfile/directives/log .
