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
    [Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
    [Security.Cryptography.RandomNumberGenerator]::Fill($tokenBytes)
    $password = [Convert]::ToBase64String($passwordBytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
    $token = [Convert]::ToBase64String($tokenBytes)
    @(
        'APP_PORT=8080'
        'APP_USERNAME=itadmin'
        "APP_PASSWORD=$password"
        'MANAGEMENT_AGENT_URL=http://host.docker.internal:8788'
        "MANAGEMENT_AGENT_TOKEN=$token"
    ) | Set-Content -LiteralPath $envPath -Encoding UTF8
    Write-Host "Lokale Zugangsdaten: itadmin / $password" -ForegroundColor Yellow
    Write-Host 'Die Daten wurden zusätzlich in .env gespeichert.' -ForegroundColor DarkGray
}

$arguments = @('compose', 'up', '-d')
if ($Rebuild) { $arguments += '--build' } else { $arguments += @('--build', '--pull', 'missing') }
& docker @arguments
if ($LASTEXITCODE -ne 0) { throw 'Der Docker-Start ist fehlgeschlagen.' }
Write-Host 'IT Lifecycle V1 läuft unter http://localhost:8080' -ForegroundColor Green
Write-Host 'Agent separat starten: .\public\agent\Start-ItLifecycleGateway.ps1 -ListenPrefix http://+:8788/' -ForegroundColor Cyan
