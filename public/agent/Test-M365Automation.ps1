[CmdletBinding()]
param(
    [string]$ConfigurationPath = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '.env'),
    [string]$TenantId = '',
    [string]$ClientId = '',
    [string]$CertificateThumbprint = '',
    [string]$Organization = '',
    [string]$SkuPartNumber = 'SPB',
    [switch]$InstallMissingModules
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$envLoaderPath = Join-Path $PSScriptRoot 'Import-ItLifecycleEnv.ps1'
if (-not (Test-Path -LiteralPath $envLoaderPath)) { throw "Konfigurationslader fehlt: $envLoaderPath" }
. $envLoaderPath
$configuration = Import-ItLifecycleEnv -Path $ConfigurationPath
if (-not $TenantId) { $TenantId = $env:M365_TENANT_ID }
if (-not $ClientId) { $ClientId = $env:M365_CLIENT_ID }
if (-not $CertificateThumbprint) { $CertificateThumbprint = $env:M365_CERT_THUMBPRINT }
if (-not $Organization) { $Organization = $env:M365_ORGANIZATION }
$missingSettings = @(
    if ([string]::IsNullOrWhiteSpace($TenantId)) { 'M365_TENANT_ID' }
    if ([string]::IsNullOrWhiteSpace($ClientId)) { 'M365_CLIENT_ID' }
    if ([string]::IsNullOrWhiteSpace($CertificateThumbprint)) { 'M365_CERT_THUMBPRINT' }
    if ([string]::IsNullOrWhiteSpace($Organization)) { 'M365_ORGANIZATION' }
)
if ($missingSettings.Count -gt 0) { throw "Folgende Werte fehlen in $ConfigurationPath`: $($missingSettings -join ', ')" }
$requiredModules = @(
    'Microsoft.Graph.Authentication',
    'Microsoft.Graph.Users',
    'Microsoft.Graph.Users.Actions',
    'Microsoft.Graph.Identity.DirectoryManagement'
)

foreach ($moduleName in $requiredModules) {
    if (-not (Get-Module -ListAvailable -Name $moduleName)) {
        if (-not $InstallMissingModules) { throw "PowerShell-Modul fehlt: $moduleName. Mit -InstallMissingModules darf das Skript es installieren." }
        Install-Module -Name $moduleName -Scope AllUsers -Repository PSGallery -Force -AllowClobber
    }
    Import-Module $moduleName -ErrorAction Stop
}

$certificate = Get-ChildItem -Path Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
    Where-Object Thumbprint -eq $CertificateThumbprint |
    Select-Object -First 1
if (-not $certificate) { throw "Zertifikat $CertificateThumbprint wurde fuer den aktuellen Benutzer nicht unter Cert:\CurrentUser\My gefunden." }
if (-not $certificate.HasPrivateKey) { throw 'Das gefundene Zertifikat besitzt keinen privaten Schluessel.' }

$graphConnected = $false
try {
    Connect-MgGraph -TenantId $TenantId -ClientId $ClientId -CertificateThumbprint $CertificateThumbprint -NoWelcome
    $graphConnected = $true
    $sku = Get-MgSubscribedSku -All | Where-Object SkuPartNumber -eq $SkuPartNumber | Select-Object -First 1
    if (-not $sku) { throw "Lizenz-SKU '$SkuPartNumber' wurde nicht gefunden." }
    $freeLicenses = [int]$sku.PrepaidUnits.Enabled - [int]$sku.PrepaidUnits.Warning - [int]$sku.ConsumedUnits
    Write-Host "Microsoft Graph: OK - $SkuPartNumber frei: $freeLicenses" -ForegroundColor Green

    $exchangeHelper = Join-Path $PSScriptRoot 'Invoke-ExchangeMailboxCheck.ps1'
    if (-not (Test-Path -LiteralPath $exchangeHelper)) { throw "Exchange-Testskript fehlt: $exchangeHelper" }
    $exchangeOutput = & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $exchangeHelper `
        -ClientId $ClientId `
        -CertificateThumbprint $CertificateThumbprint `
        -Organization $Organization `
        -Mode Probe 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Exchange Online: $($exchangeOutput -join ' ')" }
    Write-Host 'Exchange Online: OK' -ForegroundColor Green
} finally {
    if ($graphConnected) { Disconnect-MgGraph -ErrorAction SilentlyContinue }
}

Write-Host 'Die unbeaufsichtigte Microsoft-365-Anmeldung ist einsatzbereit.' -ForegroundColor Cyan
