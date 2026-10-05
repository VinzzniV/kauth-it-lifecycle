# Setup unter Windows

## Entwicklungsumgebung

Git, Node.js 22.16 oder neuer und Docker für Linux-Container installieren. Vorhandene kompatible Werkzeuge erhalten. Windows PowerShell 5.1 ist für Agent-Laufzeittests erforderlich; AD/Graph/Exchange werden in Tests durch lokale Adapter ersetzt.

```powershell
npm ci
npm run dev
npm test
npm run build
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/powershell/Run-Regression.ps1
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/powershell/Run-GatewayRegression.ps1
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/powershell/Run-ConfigurationRegression.ps1
```

`npm run dev` nutzt Port 5173. Für die vollständige isolierte Kette zuerst `docker build --build-arg GIT_REVISION=development -t kauth/it-lifecycle:v1-candidate .` erfolgreich abschliessen, dann `node --import tsx tests/integration/acceptance.mjs` ausführen. Der Test verwendet ausschließlich synthetische Daten, eigene Tokens, Ports 18080/18081/18788 und eigene Docker-Volumes; Ergebnisse bleiben unter `work/` erhalten. Produktive `.env`, Queue und Volume niemals in Tests einbinden.

## Produktionskonfiguration vorbereiten

1. `.\Configure-ItLifecycle.ps1` erstellt bzw. ergänzt die zentrale lokale `.env`, ohne bestehende Geheimnisse zu rotieren. `.env.example` beschreibt die Schlüssel.
2. Vertrauenswürdige HTTPS-Adressen für Web und Gateway, Zertifikate und eine delegierte Gatewayidentität festlegen. Der Container muss dem Gatewayzertifikat vertrauen und dessen DNS/SAN prüfen können. Keine Zertifikatsprüfung abschalten.
3. `.\Manage-ItLifecycle.ps1 -Command Check` prüft die Struktur; `-Command Setup` mit Identität, HTTPS-Thumbprint und ausdrücklich begrenzten Quelladressen zeigt den Systemänderungsplan.
4. Systemsetup erst nach Freigabe mit `-ApplySetup` aktivieren. Keine allgemeinen URL-Reservierungen für „Jeder“ verwenden. RDP/WinRM erhalten.
5. Web-HTTPS als optionales Compose-Profil vorbereiten: geschützte `web.crt`/`web.key` außerhalb des Buildkontexts, `WEB_TLS_HOST`/`WEB_TLS_CERT_DIRECTORY` in `.env`; `docker compose --profile https config --quiet` validiert die Konfiguration.

Direktes Web-HTTP bindet standardmäßig nur an Loopback. Testmodus wird ausschließlich in isolierten Testkonfigurationen gesetzt. Die komplette Start-/Status-/Stop-/Update-/Backup-/Restorefolge steht in [OPERATIONS.md](OPERATIONS.md).
