# V1 implementation

Arbeitsbranch `implementation/v1-isolated`, Worktree `C:\IT-Lifecycle\work\v1`; Ausgangsrevision `16755f9`. Produktion bleibt unveraendert. Main-Merge, Push, produktive Mutationen und Serverumstellung brauchen abschliessende Freigabe.

## Pakete und Stand

1. Umgebung: Git/Codex/Docker/Compose, PS5.1/7, Edge und AD/Graph/Exchange inventarisiert. Node22.23.3 portabel aus offizieller SHA-gepruefter ZIP; Windows/Linux `npm ci`. Node-Minimum22.16 wegen nativer SQLite-Backupfunktion.
2. Automation: operationsabhaengige Vertraege, fruehes Cleanup, WhatIf/Freigabe, Einzelaktionen, GUID-Ruecknahme, persistente Gatewaylieferung und Neustartabgleich implementiert. 20 Agent-/11 Gateway-/3 Konfigurationsfaelle unter echter PS5.1 bestanden.
3. Web: XLS/XLSX/UTF8/CP1252/CSV-Quoting, Wechsel/Datum, wirksame Stammdaten, manuelle Offboardingaufgaben, Lese-/Widerrufslinks, Mobile-Layout und Ladefehler umgesetzt. 19 Webregressionen bestanden.
4. Integration: atomare Jobs/Claims/Receipts/Ergebnisse; Browser liest nur; gezielte Wiederholung und manuelle Klaerung; stabile Aktenidentitaet/Eventzuordnung; Diagnose und konsistentes Backup/Restore implementiert. 10 Kernregressionen bestanden.
5. Betrieb: gebuendelte Setup/Check/Start/Status/Stop/Update/Backup/Restore-Befehle, vorbereitete ACL/HTTPS/Firewall/Startaufgabe, optionaler TLS-Proxy. 4 PS5.1-Betriebsfaelle; echte HTTPS-Probe und Fehlerlog-Tokenredaktion geprueft.
6. Abnahme: vollstaendige Browser/Gateway/Retry/Rollback/Restore-Kette bestanden (work/v1-1791189535470). Reviewer-Recheck ohne weitere bestaetigte Befunde. Exakte abschliessende Release-SHA/Image/Abnahme werden in work/release.json festgehalten.

## Entscheidungen und Nachweise

- Eine Webapp, SQLite/D1, ein Gateway und zentrale `.env`; keine zusaetzliche Orchestrierung.
- Gespeicherte Jobs ohne Credentials; Gateway liefert authentifiziert bis zum atomaren, idempotenten Receipt. Einzelaktionsclaims + eine Akten-Sperre verhindern doppelte Starts.
- Unklare externe Wirkung bleibt `review_required`; Abgleich kann nie angenommene Jobs gegen spaete Annahme sperren. Keine blinde Wiederholung.
- WhatIf aendert keine produktiven Aufgaben/Ausgangslaeufe. Execute braucht `executeApproved=true`.
- AD-Ruecknahme nutzt GUID und Zustand; Tickets/M365 bleiben ausdruecklich manuell. Externe Offboardingkonten bleiben konkrete manuelle Aufgaben.
- Native Implementierer: GPT-6.1 Sol/high (PowerShell), GPT-6.1 Sol/medium (Web); Reviewer GPT-6.1 Sol/high. Modelle verfuegbar, kein Ersatz. Maximal zwei Implementierer, disjunkte Dateien; Hauptagent verantwortet Integration/Staging.
- Unabhaengige Befunde zu Referenzimport, manuellen Regeln, spaetem Uebergabefehler, Standortcodes und Offboarding-Zugangsanzeige korrigiert und unabhaengig erneut geprueft.
- Lesende Graph-/Exchange-Probe am 05.10.2026 erfolgreich, 2 freie SPB. Kein Nachweis produktiver Schreibrechte oder Bereitstellungswirkung.
