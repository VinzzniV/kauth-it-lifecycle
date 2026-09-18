[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.git'))) {
    throw 'Dieses Skript muss im geklonten GitHub-Projekt ausgeführt werden.'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.env'))) {
    throw 'Die lokale .env fehlt. Kopiere zuerst .env.example nach .env und trage sichere Werte ein.'
}

Push-Location $PSScriptRoot
try {
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw 'GitHub-Update fehlgeschlagen. Lokale Änderungen oder ein Netzwerkfehler verhindern das Update.' }

    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'Das Docker-Image konnte nicht aktualisiert werden.' }

    docker compose ps
    if ($LASTEXITCODE -ne 0) { throw 'Der Containerstatus konnte nicht gelesen werden.' }
} finally {
    Pop-Location
}

Write-Host 'IT Lifecycle wurde aktualisiert. Die lokale .env und die Daten im Docker-Volume blieben erhalten.' -ForegroundColor Green
