[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$TenantId,
    [Parameter(Mandatory = $true)][string]$ClientId,
    [Parameter(Mandatory = $true)][string]$CertificateThumbprint,
    [Parameter(Mandatory = $true)][string]$Organization,
    [string]$SkuPartNumber = 'SPB',
    [switch]$InstallMissingModules
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
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
