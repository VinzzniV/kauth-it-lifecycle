# Betrieb der V1

Alle Befehle laufen aus der geprüften Arbeitskopie unter Windows PowerShell 5.1. Web und Gateway lesen dieselbe lokale `.env`. `IT_LIFECYCLE_WEB_URL` ist die HTTPS-Webadresse für authentifizierte Ergebnisimporte; `MANAGEMENT_AGENT_URL` die aus dem Container erreichbare HTTPS-Gatewayadresse. Keine Zertifikatsprüfung abschalten. In isolierten Tests dürfen eigene Loopbackports mit `IT_LIFECYCLE_TEST_MODE=1` verwendet werden.

```powershell
.\Configure-ItLifecycle.ps1
.\Manage-ItLifecycle.ps1 -Command Check
.\Manage-ItLifecycle.ps1 -Command Setup -Identity 'KAUTH\svc-lifecycle$' -HttpsThumbprint '<40 Hexzeichen>' -GatewayRemoteAddress '<Container-/Hostnetz>'
.\Manage-ItLifecycle.ps1 -Command Start
.\Manage-ItLifecycle.ps1 -Command Status
.\Manage-ItLifecycle.ps1 -Command Stop
```

Setup zeigt zunächst nur den Plan. Erst ein ausdrücklich genehmigter Aufruf mit `-ApplySetup` reserviert HTTPS, schränkt `.env`/Queue auf SYSTEM, Administratoren und die benannte Identität ein, ergänzt eine begrenzte Firewallregel und registriert eine geplante Startaufgabe. RDP/WinRM und Firewallprofile werden dabei nicht geändert. Die Identität benötigt delegierte AD-/ADSync-Rechte, Leserechte am Code und Zugriff auf ihr M365-Zertifikat. Das HTTPS-Zertifikat liegt mit privatem Schlüssel in `LocalMachine\My`; das M365-Zertifikat muss unter der tatsächlichen Aufgabenidentität erreichbar sein. Bei einem normalen Dienstkonto ist zusätzlich `-TaskCredential (Get-Credential)` erforderlich. Kein Domain-Admin-Dienstkonto verwenden.

Das Gateway speichert Aufträge, DPAPI-Dateien, Prozesszustand, Ergebnis und Importbestätigung in seiner geschützten Queue. Es verarbeitet seriell und wiederholt Ergebnislieferungen bis zur Bestätigung, auch nach Neustart. Ein laufender Kindprozess wird anhand PID und Startzeit beobachtet. Ein verschwundener Prozess erzeugt „Prüfung erforderlich“; seine externen Aktionen werden niemals blind erneut gestartet. Nur nachweislich noch nicht gestartete `accepted`-Aufträge starten nach Neustart. Alte Queue-Dateien erst nach bestätigtem Import und geregelter Aufbewahrungsfrist archivieren; offene Ergebnisse nicht löschen.

```powershell
.\Manage-ItLifecycle.ps1 -Command Backup -Image 'kauth/it-lifecycle:<geprüftes Tag>' -Volume '<Quellvolume>' -BackupDirectory 'D:\Backups\lifecycle-<Datum>'
.\Manage-ItLifecycle.ps1 -Command Restore -Image 'kauth/it-lifecycle:<geprüftes Tag>' -Volume 'lifecycle-restore-<Datum>' -BackupDirectory 'D:\Backups\lifecycle-<Datum>'
.\Update-Server.ps1 -Revision '<vollständige geprüfte SHA>' -Image 'kauth/it-lifecycle:<geprüftes Tag>' -Volume '<aktuelles Volume>' -BackupDirectory 'D:\Backups\lifecycle-vor-update'
```

Backup erstellt über SQLite eine konsistente Momentaufnahme und einen geprüften Hash. Restore akzeptiert ausschließlich ein neues Volume. `.env` und Zertifikatsschlüssel sind getrennt in einem zugriffsbeschränkten Backup aufzubewahren; Wiederherstellung unter der geplanten Identität prüfen. Update verlangt die bereits geprüfte Revision und das passend beschriftete Image, eine leere aktive Queue und bestätigte Ergebnisimporte; es sichert vor Migration und prüft Web/Gateway. Es zieht keine mutable Hauptlinie. Für Rückkehr: Gateway stoppen, Backup in ein neues Volume restaurieren, vorheriges Image mit diesem Volume und alter Konfiguration starten, Gesundheitschecks prüfen, Gateway starten. Das migrierte Volume bis zur Ursachenprüfung behalten.

Regressionen: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/powershell/Run-Regression.ps1`, `Run-GatewayRegression.ps1` und `Run-ConfigurationRegression.ps1`. Diese nutzen ausschließlich lokale Adapter, eigene Queue, Ports und Test-Credentials. Sie bestätigen keine produktive AD-/M365-/HelpDesk-Integration.

`WEB_TLS_HOST` aktiviert bei den gebuendelten Start-/Status-/Stop-/Updatebefehlen automatisch das HTTPS-Profil. `Check` verlangt dann `web.crt` und `web.key`. `-ConfigurationPath` gilt einheitlich fuer Compose und Gateway; bestehende Geheimnisse werden beibehalten. `Setup -WebRemoteAddress '<freigegebenes Clientnetz>'` ergaenzt nach `-ApplySetup` die begrenzte Web-HTTPS-Regel. Ohne diesen Parameter wird keine pauschale Webregel erzeugt. Firewallprofile und bestehende RDP-/WinRM-Regeln bleiben erhalten; eine derzeit deaktivierte Domaenenfirewall muss der Betreiber im geplanten Wartungsfenster mit geprueften Zugangsregeln behandeln.

Caddy redigiert auch in Fehlerlogs die Request-URI und alle Requestheader; deaktiviertes Accesslogging allein genuegt nicht. Die optionale Proxykomponente ist reine TLS-Terminierung, kein neuer Anwendungsdienst.

Mindestlaufzeit Node22.16 wegen `node:sqlite.backup`; getestet22.23.3. Setup-Test: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/powershell/Run-OperationsRegression.ps1`. Die Browser-Abnahmekette startet `node tests/integration/acceptance.mjs` und legt ausschliesslich eigene Testvolumes, Ports18080/18081/18788, lokale Adapter und synthetische Zugangsdaten an.

Betriebsannahme fuer V1: taegliches verschluesseltes externes Backup mit 14 Tagesstaenden, zusaetzliche Sicherung vor jedem Update; vorgeschlagenes RPO24h/RTO2h. Diese Ziele sind vor Aktivierung vom Betreiber zu bestaetigen; der lokale Restoretest beweist Datenkonsistenz, keine zugesicherte Wiederanlaufzeit. Konfiguration, HTTPS-Paar und M365-PFX/Schluesselwiederherstellung separat geschuetzt archivieren. Import des M365-Zertifikats und Leserecht am privaten Schluessel unter der tatsaechlichen Gatewayidentitaet pruefen; keine Schluessel in Berichte oder Git exportieren.
