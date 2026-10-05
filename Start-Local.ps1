[CmdletBinding()]
param([switch]$Rebuild)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$envPath = Join-Path $projectPath '.env'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop wurde nicht gefunden.' }
docker info 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop läuft nicht. Bitte Docker Desktop starten und das Skript erneut ausführen.' }

if (-not (Test-Path -LiteralPath $envPath)) {
    $passwordBytes = [byte[]]::new(18)
    $tokenBytes = [byte[]]::new(32)
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($passwordBytes)
        $generator.GetBytes($tokenBytes)
    } finally {
        $generator.Dispose()
    }
    $password = [Convert]::ToBase64String($passwordBytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
    $token = [Convert]::ToBase64String($tokenBytes)
    @(
        'APP_PORT=8080'
        'APP_USERNAME=itadmin'
        "APP_PASSWORD=$password"
        'MANAGEMENT_AGENT_URL=https://host.docker.internal:8788'
        'IT_LIFECYCLE_WEB_URL=https://localhost'
        'MANAGEMENT_AGENT_LISTEN_PREFIX=https://+:8788/'
        "MANAGEMENT_AGENT_TOKEN=$token"
        'M365_TENANT_ID='
        'M365_CLIENT_ID='
        'M365_CERT_THUMBPRINT='
        'M365_ORGANIZATION='
    ) | Set-Content -LiteralPath $envPath -Encoding UTF8
    . (Join-Path $PSScriptRoot 'public\agent\Import-ItLifecycleEnv.ps1')
    Protect-NewItLifecycleConfiguration -Path $envPath
    Write-Host 'Lokale Zugangsdaten wurden in .env gespeichert. Dateizugriff vor dem Start einschraenken.' -ForegroundColor Yellow
}

$arguments = @('compose', 'up', '-d')
if ($Rebuild) { $arguments += '--build' }
& docker @arguments
if ($LASTEXITCODE -ne 0) { throw 'Der Docker-Start ist fehlgeschlagen.' }
Write-Host 'Webcontainer gestartet. Fuer den Betrieb die vorbereitete HTTPS-Webadresse verwenden.' -ForegroundColor Green
Write-Host 'Konfiguration bearbeiten: .\Configure-ItLifecycle.ps1' -ForegroundColor Cyan
Write-Host 'Agent separat starten: .\public\agent\Start-ItLifecycleGateway.ps1' -ForegroundColor Cyan
