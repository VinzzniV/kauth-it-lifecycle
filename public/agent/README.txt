IT Lifecycle Gateway und Agent (V1)
=================================

Gateway und Web lesen dieselbe lokale .env. Setup/Betrieb: OPERATIONS.md.

  .\Configure-ItLifecycle.ps1
  .\Manage-ItLifecycle.ps1 -Command Check
  .\public\agent\Start-ItLifecycleGateway.ps1

Das Gateway verarbeitet gespeicherte execute-, reference_check- und
rollback-Auftraege seriell. Execute erfordert requestedMode=Execute und
executeApproved=true nach interner Freigabe. Es gibt keinen -Confirm-Schalter
und keine interaktive Freigabe im Agentprozess. WhatIf fuehrt keine externen
Aenderungen durch, darf aber Verzeichnisdaten lesen und lokale Ergebnisse
schreiben. WhatIf ist deshalb keine isolierte Testumgebung.

AD, HelpDesk und initiales Benutzerkennwort werden ausschliesslich als
kurzlebige DPAPI-Dateien unter derselben Gateway-/Agentidentitaet uebergeben.
Sie werden auch bei fruehen Fehlern entfernt. Konfiguration und Queue muessen
auf SYSTEM, Administratoren und die delegierte Gatewayidentitaet beschraenkt
sein; produktiver Gatewaystart verweigert breite lokale Zugriffsrechte.
HTTPS ist fuer Listener und Ergebnisimport ausserhalb isolierter Tests Pflicht.

Ergebnisse bleiben atomar in *.result.json, bis der Webserver den
authentifizierten POST /api/gateway/results bestaetigt (*.ack.json).
Browserpolling dient nur der Anzeige. Doppelte identische Job-IDs werden nicht
erneut gestartet; dieselbe ID mit anderen Aktionen wird abgewiesen.
Neustarts beobachten noch lebende Prozesse anhand PID und Startzeit. Unklare
Ausgaenge werden als review_required geliefert und niemals blind wiederholt.

actionResults beschreibt jede Einzelaktion: completed, failed,
review_required oder simulated. Nur failed darf nach Beseitigung der Ursache
gezielt wiederholt werden. Bei unklarer externer Wirkung zuerst manuell pruefen.
AD-Aenderungen enthalten unveraenderliche Objekt-GUIDs, Gruppenmitglied-GUIDs
und erwartete Vorher-/Nachherwerte. Rollback prueft den aktuellen Zustand und
blockiert Konflikte. WhatIf-Rollback simuliert ohne reale Ruecknahme.
M365 und HelpDesk haben keinen automatischen Ruecknahmeweg; die Akte zeigt
diese Schritte als manuelle Nacharbeit.

M365: Zertifikatanmeldung an Graph, delegierter ADSync-Aufruf, Entra-Benutzer
abwarten, SPB-Verfuegbarkeit pruefen, bei Bedarf lizenzieren und Exchange-
Postfach bestaetigen. Die E-Mail-Aufgabe ist erst danach abgeschlossen.
M365-Einzelwiederholung benoetigt AD/WinRM-Credentials fuer ADSync, aber keine
AD-Cmdlets oder ADWS-Vorpruefung. HelpDesk-Einzelwiederholung benoetigt nur die
separate HelpDesk-Anmeldung. Ziele stammen aus vertrauenswuerdiger .env.

M365-Zertifikat samt privatem Schluessel unter der tatsaechlichen
Gatewayidentitaet bereitstellen. Rechte und Exchange-RBAC gezielt delegieren.
Keine Domain-Admin-Dienstidentitaet. Lesender Verbindungstest:

  .\public\agent\Test-M365Automation.ps1

InstallMissingModules installiert fehlende Module nur auf ausdruecklichen
Aufruf; ein Verbindungstest bestaetigt keine reale Lizenz-/Postfachautomation.
Die isolierten PS5.1-Regressionen in tests/powershell ersetzen AD, ADSync,
Graph, Exchange und HelpDesk ausschliesslich durch lokale Testadapter.
