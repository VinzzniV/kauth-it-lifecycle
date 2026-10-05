# Deployment und Rueckkehr

Status: lokale Testumstellung am 05.10.2026 freigegeben, einschliesslich vorlaeufigem HTTP und bestehendem Administratorkonto fuer isolierte Adapter. Hauptverzeichnis ist `C:\IT-Lifecycle`; konkreter Aktivierungsbeleg, Revisions-/Imageidentitaet, aktuelles Datenvolume und Backup stehen in `work/LOCAL-DEPLOYMENT-REPORT.md` und `work/active-deployment-path.txt`. Die urspruengliche V1-Arbeitskopie auf `implementation/v1-isolated` bleibt erhalten. HTTP-Betriebsbefehle: `work/TEST-INSTALLATION.md`; keine Firewall-, PKI- oder realen externen Schreibfreigaben daraus ableiten. Die folgenden HTTPS-/Identitaetsgates gelten fuer den spaeteren sicheren Betrieb.

## Vor spaeterem sicheren Betrieb konkret festzulegen

- Delegierte Gatewayidentitaet (gMSA bevorzugt), Leserecht am Release und M365-Zertifikat/privatem Schluessel; AD-/ADSync-/Exchange-/Graph-/HelpDesk-Rechte je unterstuetzter Aktion. Kein Domain-Admin-Dienst.
- DNS/SAN/vertrauenswuerdige CA fuer Web und Gateway; Container vertraut Gateway-CA, Windows-Gateway vertraut Web-CA. Kein Abschalten der Zertifikatspruefung. Vorhandene Domain-CA muss gegebenenfalls in das abgeleitete Betriebsimage importiert und dieses nochmals geprueft werden.
- Explizite Clientnetze fuer443 und Container-/Hostquelle fuer8788, bestehende RDP/WinRM-Zugangsregeln, HelpDesk-Transportziel und Backupziel. Der aktuell ausgeschaltete Domaenen-Firewallzustand wird nur im abgesprochenen Wartungsfenster geaendert.
- Wartungsfenster, Sicherungsaufbewahrung und akzeptierte RPO/RTO. Noch offene produktive/historische Laeufe und alte Queue vor dem Wechsel separat pruefen; alte Ergebnisse ohne gesicherten Job/GUID-Vertrag nicht nachtraeglich als V1-Ergebnisse akzeptieren.

## Reihenfolge nach ausdruecklicher Freigabe

1. Die in work/release.json benannte exakte Revision und das passende unveraenderliche Image lokal bereitstellen; referenzierten Abnahmelauf auf passed pruefen. Kein mutable-main-Pull und kein ungepruefter Neubau. Main-Merge/Push sind gesonderte Freigabeschritte.
2. Aktuelles Image `sha256:8b150f01af324b5433c5f2b188a11efc306d782dbcea85cbef8f021d6391c5b8`, Konfiguration und Zertifikate geschuetzt sichern; produktives SQLite-Volume konsistent mit `Manage-ItLifecycle -Command Backup` sichern. Sicherung in NEUES Pruefvolume restaurieren und Integritaet pruefen.
3. Release in einer separaten Serverkopie bereitstellen. Dieselbe geplante `.env` an Web/Gateway geben; APP_CONTAINER_NAME=kauth-it-lifecycle, APP_VOLUME_NAME=kauth_it_lifecycle_data, Loopback8080, HTTPS-Adressen und TLS-Profil setzen. Bestehende Secrets erhalten; Rotation nur in koordiniertem Neustart.
4. `Manage-ItLifecycle -Command Check`; `-Command Setup -Identity <freigegebene Identitaet> -HttpsThumbprint <Gatewaycert> -GatewayRemoteAddress <freigegebene Quellen> -WebRemoteAddress <freigegebene Clientnetze>` pruefen. Erst nach Planfreigabe `-ApplySetup`; Zertifikatszugriff unter Aufgabenidentitaet separat nachweisen. Keine ungezielte Firewall-/ExecutionPolicy-/Defenderaenderung.
5. Neue Auftraege stoppen, Gatewayqueue und Ergebnisimporte auslaufen lassen. Wartungsbackup erstellen. `Update-Server.ps1 -Revision <gepruefte SHA> -Image kauth/it-lifecycle:<geprueftes Tag> -Volume kauth_it_lifecycle_data -BackupDirectory <geschuetztes Ziel>` aus der exakten sauberen Releasekopie. Migrationen laufen beim Webstart; danach Web-/Gatewayhealth und Diagnose-SHA pruefen.
6. Ohne externe Mutation intern anmelden, Akten/aktuellen Aufgabenstand/Stammdaten/Statuslinks und Widerrufsverhalten pruefen; lesende Integrationspruefungen unter Dienstidentitaet. Erst separat freigegebene benannte Testobjekte erlauben produktive Execute-/Lizenz-/Tickettests. Vorhandene alte Ticketlinks bleiben lesend, 30Tage ab Migration; Aufgabenbearbeitung verlangt interne Anmeldung.
7. Nach Gateerfolg Nutzung freigeben; altes Image, altes Release und Backup behalten. Bei Fehlgate keine neuen externen Aktionen erlauben.

## Rueckkehr bei Fehler

- Gateway/Task und neue Webannahmen stoppen; laufende externe Aktionen auslaufen lassen bzw. ihren Zustand manuell klaeren. Rueckkehr des Servers nimmt externe AD/M365/Ticketwirkungen nicht automatisch zurueck.
- Wartungsbackup mit `Manage-ItLifecycle -Command Restore` in ein NEUES Volume (z.B. `kauth_it_lifecycle_return_<Zeitpunkt>`) restaurieren; bestehendes migriertes Volume behalten.
- Vorheriges Image mit vorheriger Konfiguration und restauriertem Volume in der gesicherten alten Releasekopie starten; Loopback/HTTPS-Netzzugang entsprechend dem freigegebenen Plan. Kein altes Image auf das bereits migrierte Volume setzen.
- Datenintegritaet, Health, Akten-/Aufgabenanzahlen, Geheimnisgleichheit ohne Ausgabe und Zertifikatszugriff pruefen. Gateway erst starten, wenn Queue und gespeicherte Jobs zum zurueckgesetzten Datenstand abgeglichen sind; nach Backup entstandene Auftraege manuell behandeln, niemals blind neu ausfuehren.

Der Plan ist technisch vorbereitet. Identitaet, PKI-Vertrauen, freigegebene Netze und produktive Schreibrechte lassen sich aus den lokalen Adaptertests nicht ableiten; diese verbleibenden Betreiberangaben sind Teil der abschliessenden Deploymentfreigabe.
