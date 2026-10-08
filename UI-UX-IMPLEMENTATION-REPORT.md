# UI/UX-Umsetzung der bestehenden V1

Aktualisierung 08.10.2026: Die Übernahme ist inzwischen ausdrücklich beauftragt. Die frühere Vorschau wird nach erfolgreicher Prüfung der Hauptinstallation entfernt. Aktueller Release und Betriebsnachweis: [LOGIN-DIAGNOSTICS-RELEASE.md](LOGIN-DIAGNOSTICS-RELEASE.md). Die Angaben zur Vorschau und ausstehenden Freigabe weiter unten beschreiben den ursprünglichen Abnahmestand vom 05.10.2026.

Stand: 05.10.2026. Auftrag: vollständiger Bericht `C:\IT-Lifecycle\Audit\UI-UX-Audit-Kauth-IT-Lifecycle.md`, K1, W1–W10 und C1. Arbeitsregeln aus AGENTS.md eingehalten.

## Basis und Isolation

Vor Beginn geprüft: maßgebliche Arbeitskopie `C:\IT-Lifecycle`, Branch main, Revision `46968c8b3c9b5e93b0e8ca48b34d53eb10b59abc`. Laufender Container `kauth-it-lifecycle`, Image `kauth/it-lifecycle:v1-http-46968c8`, Image-ID `sha256:ebd4c7a269417289c5cd8637c1e57d9a8f2ecda62974654fb03ec67396c8e2f1`, Datenvolume `kauth_http_v1_return_20261005_122306`. Image-Label, Compose-Arbeitsverzeichnis, Gitstand und Mounts stimmen überein.

Umsetzung auf eigenem lokalem Branch `implementation/ui-ux-audit` im Worktree `C:\IT-Lifecycle\work\ui-ux`. Vorhandene Auditdateien, Rückfallarbeitskopie, lokale Konfiguration und bestehende Mitarbeiterdaten erhalten. Kein Push und keine Übernahme in die laufende Installation.

Die Befunde wurden am aktuellen Code überprüft. Eine zusätzliche lesende API-Prüfung der bestehenden Installation gab ausschließlich anonymisierte Zustandszahlen aus: zwei abgeschlossene Akten, eine mit drei aktiven Einträgen; eine mit sechs beantragten Einträgen, sechs erledigten Aufgaben, fehlgeschlagenem letztem Lauf und einem eindeutig erkennbaren Referenzeintrag samt generierter Aufgabe. Keine neuen Zustände im bestehenden Datenbestand angelegt.

## Befundzuordnung

| Befund | Umsetzung am aktuellen Stand | Testnachweis / Grenze |
|---|---|---|
| K1 | Freigabe nennt Mitarbeiter, Personalnummer, Zielkonto, Systeme einschließlich M365 und Aktionsanzahl aus genau dem angezeigten Auftrag. Unterstützte Rücknahme und manuelle Grenzen erklärt. | `ui-projections.test.ts`: tatsächlicher Umfang und fehlende Systeme; Browser: Person wechseln, Dialog erneut öffnen/abbrechen, alle drei Größen. |
| W1 | Vorgangsstatus, Aufgabenfortschritt, dokumentierter Bestandsstatus und letzter Automationslauf getrennt. Beantragt/Freigegeben bleibt unbestätigt, keine Bestandsableitung aus Aufgaben. Öffentliche Listen nach bestätigten und nicht bestätigten Einträgen getrennt. | Test mit abgeschlossener Akte, erledigten Aufgaben, beantragtem Bestand und fehlgeschlagenem Lauf; Browser und öffentliche API. Keine aktuelle externe Systemabfrage behauptet. |
| W2 | Explizite Referenzfelder als Referenzmetadaten, aus sichtbarer Ausstattung und Aufgaben entfernt. Originaleinträge in Historie erhalten. Neue Importe speichern Kategorie Referenz ohne Bereitstellungsaufgabe. Öffentliche API entfernt diese Einträge und ersetzt bekannte Referenznamen in sonstigen Titeln durch „Referenzprofil“. | Gezielte Import-/Projektions-/Datenerhaltungstests, echter isolierter API-Test, öffentliche Browseransicht. Nur eindeutige Feldsyntax und exakt zugehörige generierte Aufgaben; freie/mehrdeutige Texte werden nicht pauschal bereinigt. |
| W3 | Letztes Ergebnis und belegbarer Handlungsbedarf vor Planung. Aktenkopf und Register außerhalb des scrollenden Inhalts. Plan, Rohdaten, Kennungen und ältere Laufgruppen einklappbar. Beziehungen über `relatedRunId`, einschließlich Ketten; Fehler bleiben dokumentiert. | Gruppierungs-/WhatIf-/Fehlerbehebungstests; Browser: Scrollposition und Registerposition, Laufgruppen und Fokus. Bestehende Gruppen-Zusammenfassung bleibt erhalten. |
| W4 | Globale Planung zeigt Vorgangsstand und letztes Ergebnis; „Ergebnis in der Akte ansehen“ öffnet direkt Automation. Vollauftrag ausdrücklich „Neuen vollständigen Auftrag vorbereiten“. Einzelwiederholung und Sperren erklärt. | Browser: direkter Einstieg, fehlgeschlagene, teilweise und wiederholte Fälle. Vorhandene serverseitige Retry-Gates unverändert; erfolgreiche WhatIf-Läufe heben Fehler nicht auf. |
| W5 | Ausgewählter Lauf liefert Zielkonto, geplante Aktionen, protokollierte Änderungen und bereits belegte echte Rücknahmen. „Wird zurückgenommen“ getrennt von „Bleibt bestehen / manuell zu bearbeiten“. Unterstützte AD-Schritte verständlich benannt; technische GUIDs eingeklappt. | Dialog-/Partitionstests inklusive unbestätigter M365-/Ticketwirkung und bereits zurückgenommener Änderungen; API-Test für WhatIf/Execute-Rücknahmeprojektionen; Browser öffnet/abbricht Dialog. |
| W6 | Mitarbeitername ist ein tastaturfähiger Aktenbutton, sichtbarer Fokus und Enter-Bedienung; Mausbedienung der Zeile bleibt erhalten. | Browser: echte Tabulatorfolge ab Suche, sichtbarer Fokus, Enter; alle drei Größen. |
| W7 | Sichtbares deutsches Schließen; Anfangsfokus auf Aktenüberschrift. Löschen unter „Weitere Aktionen“, bestehende Bestätigung erhalten. | Browser: Anfangsfokus, verborgenes Löschen, Schließen, Pfeiltasten zwischen Registern und Escape. |
| W8 | Globale und aktenbezogene Aufgaben starten mit Offen; Offen/Erledigt/Alle, passende Leertexte, Erledigte anzeigen und direkte Aktenbuttons. Suche wirkt auch auf globale Aufgaben. | Filtertests und interaktive Browserprüfung aller Filter und direkter Aktenzugänge. |
| W9 | Such-Leerzustand „Keine Mitarbeiter für diese Suche gefunden“, Suche zurücksetzen. „Offene Vorgänge“, „Aufgabenfortschritt“ für den tatsächlich offenen Ausschnitt; Aufgaben-Leertext ergänzt. | Browser: Suche ohne Treffer und Reset; Übersicht mit passenden Kennzahlen. Keine Aufgaben ergeben 0 %, keine fingierte Vollständigkeit. |
| W10 | Geplante Aktionen zeigen belegte Gruppen-/Aufgaben-/Anwendungs-/OU-/HelpDesk-Regeln mit Registerlink. Referenzprofil als Quelle benannt. Fehlende konkrete Regelherkunft ausdrücklich erklärt. Stammdaten erklären Planung und erforderliche Freigabe. | Herkunftstests mit vorhandenen/fehlenden Regeln; Browser: Link öffnet passendes Register. Keine nachträglich erfundene historische Herkunft. |
| C1 | Gemeinsame deutsche Statusbegriffe, „Testlauf (WhatIf)“, technische Statusdetails einklappbar. Mobile Kennzahlen kompakt in zwei Spalten; alle Navigationspunkte und Suche erreichbar. | Browser bei 390×844, 1280×720 und 1440×900; horizontale Überbreite geprüft, Screenshots visuell kontrolliert. |

## Technische Grenzen

Keine Änderung der AD-/M365-/HelpDesk-Ausführung, Freigabesemantik, Job-/Ergebnisverträge, Idempotenz, atomaren Sperren oder GUID-basierten Rollbacksicherheit. Änderungen betreffen Darstellung, eng begrenzte Referenz-Importklassifikation und additive Leseprojektionen. Kein Schemawechsel und keine Bereinigung bestehender Daten.

Die interne API gibt aus gespeicherten Aufträgen ausschließlich Aktionstyp/Ziel und Zielkonto zusätzlich aus, keine Anmeldedaten oder Auftragsrohobjekte. Bereits zurückgenommene Änderungen werden ausschließlich aus zugeordneten echten authentifizierten Rücknahmeergebnissen abgeleitet. Die öffentliche API bleibt begrenzt, befristet, widerrufbar und nur lesbar.

Keine echten AD-/M365-/HelpDesk-Aktionen, keine echten WhatIf-/Referenzprüfungsaufträge. Regressionen nutzen ausschließlich synthetische Daten, getrennte Datenvolumes, Queues, Tokens und lokale Testadapter. Die UI-Abnahme öffnet und verwirft Dialoge und erzeugt keine Mutationsanfragen.

## Abnahme und Belege

Gezielte Tests: [tests/web/ui-projections.test.ts](tests/web/ui-projections.test.ts), einschließlich gerenderter Freigabe-/Rücknahmeinformationen, unbekannter Zustände, Referenzhistorie, öffentlicher Minimierung, Aufgabenfilter, echter erfolgreicher Wiederholungen und belegter Herkunft.

Interaktive Prüfung: [tests/ui/verify-browser.mjs](tests/ui/verify-browser.mjs), Edge über Playwright; [Browsernachweis](docs/ui-ux/browser-evidence.json). Offene, abgeschlossene, fehlgeschlagene, teilweise erfolgreiche, wiederholte und prüfpflichtige Fälle sowie bestätigter/unbestätigter Bestand in [synthetischen Testdaten](tests/ui/fixtures.ts). Keine vollständige Screenreader-/WCAG-Zertifizierung und keine Prüfung realer externer Wirkungen beansprucht.

Die verbindlichen Befehle und abschließenden Ergebnisse stehen im [Abnahmenachweis](docs/ui-ux/test-evidence.json). Der Build meldet weiterhin die vorhandene Warnung zu großen Client-Chunks; dies verhindert den erfolgreichen Build nicht.

Testablauf korrigiert: Node 22 kann während unreferenzierter Startanfragen mit ausstehendem Top-Level-Await enden. Der vorhandene Integrationsrunner hält seine Lebenszeit explizit und begrenzt Health-Anfragen. Die bestehende Registerprüfung wurde auf „Ausstattung & Bestand“ aktualisiert. Assertions zu Ausführung, Idempotenz, Retry und Rücknahme wurden erhalten und um additive API-Projektionen ergänzt. Vorhandene Sicherheitsgates wurden nicht abgeschwächt.

## Vorher/Nachher

Die Vorheransichten stammen aus dem unveränderten Basisimage mit isolierten synthetischen Daten; die Nachheransichten verwenden dieselben Fallarten. Kein Screenshot enthält Daten der vorhandenen Mitarbeiterakten. Vollständige Bildliste: [Screenshots](docs/ui-ux/screenshots).

| Änderung | Vorher | Nachher |
|---|---|---|
| Freigabeumfang | [Vorher](docs/ui-ux/screenshots/before-approval-1440.png) | [Nachher](docs/ui-ux/screenshots/after-approval-1440.png) |
| Bestandsstatus/Aktenbedienung | [Vorher](docs/ui-ux/screenshots/before-record-1440.png) | [Nachher](docs/ui-ux/screenshots/after-record-1440.png) |
| Ergebnis zuerst | [Vorher](docs/ui-ux/screenshots/before-result-1440.png) | [Nachher](docs/ui-ux/screenshots/after-result-1440.png) |
| Rücknahmegrenzen | [Vorher](docs/ui-ux/screenshots/before-rollback-1440.png) | [Nachher](docs/ui-ux/screenshots/after-rollback-1440.png) |
| Aufgaben | [Vorher](docs/ui-ux/screenshots/before-tasks-1440.png) | [Nachher](docs/ui-ux/screenshots/after-tasks-1440.png) |
| Öffentlicher Bestand | [Vorher](docs/ui-ux/screenshots/before-public-1440.png) | [Nachher](docs/ui-ux/screenshots/after-public-1440.png) |
| Mobile Übersicht | [Vorher](docs/ui-ux/screenshots/before-overview-390.png) | [Nachher](docs/ui-ux/screenshots/after-overview-390.png) |

## Vorschau, Übernahme und Rückkehr

Erreichbare isolierte Vorschau: **http://PK-SRVJOB001:18081**; auf diesem Rechner auch **http://localhost:18081**. Ausschließlich synthetische, lesbare Fälle; sämtliche API-Mutationen werden vom Testdatendienst mit 403 abgelehnt. Separate Container `kauth-ui-ux-preview` und `kauth-ui-ux-data`, eigenes Volume und eigenes Netz. Das Basisimage stellt die unveränderten Laufzeitabhängigkeiten; `dist`, Agentdateien und Migrationen stammen über schreibgeschützte Mounts aus diesem Worktree. Das ist keine Umstellung der Installation auf Port 8080. Start/Stop der Vorschau: [OPERATIONS.md](OPERATIONS.md#isolierte-uiux-vorschau).

Übernahme erst nach separater Freigabe: Commit prüfen und übernehmen, exakt diese Revision als eigenes Image bauen/labeln, offene Aufträge auslaufen lassen, aktuellen Status und Releasepin sichern, konsistentes Wartungsbackup erstellen, freigegebenen Betriebswrapper zum Update verwenden und Health/UI prüfen. Bestehende `.env` und Mitarbeiterdaten erhalten; Vorschauvolumes und synthetische Daten niemals übernehmen. Kein zusätzlicher Gateway- oder Sicherheitswechsel nötig.

Rückkehr: vorherigen Releasepin/Image und gesicherte Konfiguration wiederherstellen; falls ein Datenrestore nötig ist, ausschließlich ein neu aus dem Wartungsbackup restauriertes Volume aktivieren. Niemals das aktive Volume überschreiben. Datenbankrestore macht externe Wirkungen nicht rückgängig. Die bisherige Revision und das bisherige Image bleiben verfügbar. Hier wurde nur die Vorschau eingerichtet, kein Übernahme-/Rückkehrschritt an der bestehenden Installation ausgeführt.

Bereinigung: Eigene entbehrliche Editier-/Diagnoseskripte und ein gescheiterter Browser-HTML-Zwischenbeleg entfernt. Die automatische Ausführungsprüfung blockierte das Löschen des zugehörigen Screenshots; er ist deshalb unter dem ignorierten `work/diagnostics-archive` getrennt archiviert. Historische Unterlagen, Betriebsskripte, Konfiguration, Daten und fremde Änderungen erhalten; Testbelege getrennt von aktiver Dokumentation.
