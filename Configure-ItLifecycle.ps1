[CmdletBinding()]
param(
    [string]$ConfigurationPath = (Join-Path $PSScriptRoot '.env'),
    [switch]$RotateSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$loaderPath = Join-Path $PSScriptRoot 'public\agent\Import-ItLifecycleEnv.ps1'
if (-not (Test-Path -LiteralPath $loaderPath)) { throw "Konfigurationslader fehlt: $loaderPath" }
. $loaderPath

$settings = @{}
if (Test-Path -LiteralPath $ConfigurationPath) {
    $settings = Import-ItLifecycleEnv -Path $ConfigurationPath
}

function New-RandomValue {
    param([int]$Length = 32)
    $bytes = [byte[]]::new($Length)
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
}

function Read-ConfigurationValue {
    param([string]$Name, [string]$Label, [string]$Default = '')
    $current = if ($settings.ContainsKey($Name)) { [string]$settings[$Name] } else { '' }
    $suggestion = if ($current) { $current } else { $Default }
    $answer = Read-Host "$Label [$suggestion]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $suggestion }
    return $answer.Trim()
}

Write-Host ''
Write-Host 'Zentrale IT-Lifecycle-Konfiguration' -ForegroundColor Cyan
Write-Host 'Alle Werte landen nur in der lokalen .env. Docker und Windows-Gateway lesen dieselbe Datei.' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Herkunft der Microsoft-365-Werte:' -ForegroundColor Yellow
Write-Host '  Tenant ID    : Entra Admin Center > Identitaet > Uebersicht > Mandanten-ID'
Write-Host '  Client ID    : Entra Admin Center > App-Registrierungen > OnBoardingApp > Anwendungs-ID'
Write-Host '  Thumbprint   : Get-ChildItem Cert:\CurrentUser\My | Format-Table Subject,Thumbprint,HasPrivateKey'
Write-Host '  Organization : Microsoft 365 Admin Center > Einstellungen > Domaenen > *.onmicrosoft.com'
Write-Host ''

$settings['APP_PORT'] = Read-ConfigurationValue 'APP_PORT' 'Web-Port' '8080'
$settings['APP_USERNAME'] = Read-ConfigurationValue 'APP_USERNAME' 'Anmeldename der Webanwendung' 'itadmin'
if ($RotateSecrets -or -not $settings.ContainsKey('APP_PASSWORD') -or [string]::IsNullOrWhiteSpace([string]$settings['APP_PASSWORD']) -or [string]$settings['APP_PASSWORD'] -like 'BITTE-*') {
    $settings['APP_PASSWORD'] = New-RandomValue 24
    Write-Host 'Ein neues zufaelliges Web-Kennwort wurde erzeugt.' -ForegroundColor Green
} else {
    Write-Host 'Vorhandenes Web-Kennwort wird beibehalten.' -ForegroundColor DarkGray
}
$settings['MANAGEMENT_AGENT_URL'] = Read-ConfigurationValue 'MANAGEMENT_AGENT_URL' 'Gateway-Adresse fuer Docker' 'http://host.docker.internal:8788'
if ($RotateSecrets -or -not $settings.ContainsKey('MANAGEMENT_AGENT_TOKEN') -or [string]::IsNullOrWhiteSpace([string]$settings['MANAGEMENT_AGENT_TOKEN']) -or [string]$settings['MANAGEMENT_AGENT_TOKEN'] -like 'BITTE-*') {
    $settings['MANAGEMENT_AGENT_TOKEN'] = New-RandomValue 32
    Write-Host 'Ein neuer zufaelliger Gateway-Token wurde erzeugt.' -ForegroundColor Green
} else {
    Write-Host 'Vorhandener Gateway-Token wird beibehalten.' -ForegroundColor DarkGray
}
$settings['M365_TENANT_ID'] = Read-ConfigurationValue 'M365_TENANT_ID' 'M365 Tenant ID'
$settings['M365_CLIENT_ID'] = Read-ConfigurationValue 'M365_CLIENT_ID' 'M365 Client ID'
$settings['M365_CERT_THUMBPRINT'] = (Read-ConfigurationValue 'M365_CERT_THUMBPRINT' 'Zertifikat-Thumbprint').Replace(' ', '').ToUpperInvariant()
$settings['M365_ORGANIZATION'] = Read-ConfigurationValue 'M365_ORGANIZATION' 'Exchange-Organisation (*.onmicrosoft.com)'

if ($settings['APP_PORT'] -notmatch '^\d{1,5}$' -or [int]$settings['APP_PORT'] -lt 1 -or [int]$settings['APP_PORT'] -gt 65535) { throw 'APP_PORT ist kein gueltiger TCP-Port.' }
if ($settings['M365_TENANT_ID'] -and $settings['M365_TENANT_ID'] -notmatch '^[0-9a-fA-F-]{36}$') { throw 'M365_TENANT_ID ist keine gueltige GUID.' }
if ($settings['M365_CLIENT_ID'] -and $settings['M365_CLIENT_ID'] -notmatch '^[0-9a-fA-F-]{36}$') { throw 'M365_CLIENT_ID ist keine gueltige GUID.' }
if ($settings['M365_CERT_THUMBPRINT'] -and $settings['M365_CERT_THUMBPRINT'] -notmatch '^[0-9A-F]{40}$') { throw 'M365_CERT_THUMBPRINT muss aus 40 Hexadezimalzeichen bestehen.' }
if ($settings['M365_ORGANIZATION'] -and $settings['M365_ORGANIZATION'] -notmatch '^[A-Za-z0-9.-]+\.onmicrosoft\.com$') { throw 'M365_ORGANIZATION muss die *.onmicrosoft.com-Domaene sein.' }

$orderedNames = @(
    'APP_PORT', 'APP_USERNAME', 'APP_PASSWORD',
    'MANAGEMENT_AGENT_URL', 'MANAGEMENT_AGENT_TOKEN',
    'M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CERT_THUMBPRINT', 'M365_ORGANIZATION'
)
@(
    '# Zentrale lokale Konfiguration fuer Docker und Windows-Gateway.'
    '# Enthält Geheimnisse: nicht in Git einchecken und Dateizugriff beschraenken.'
    ''
    foreach ($name in $orderedNames) { "$name=$($settings[$name])" }
) | Set-Content -LiteralPath $ConfigurationPath -Encoding UTF8

Write-Host ''
Write-Host "Konfiguration gespeichert: $ConfigurationPath" -ForegroundColor Green
Write-Host 'Start Webanwendung : .\Update-Server.ps1' -ForegroundColor Cyan
Write-Host 'Start Gateway      : .\public\agent\Start-ItLifecycleGateway.ps1' -ForegroundColor Cyan
Write-Host 'M365-Verbindungstest: .\public\agent\Test-M365Automation.ps1' -ForegroundColor Cyan
