[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ClientId,
    [Parameter(Mandatory = $true)][string]$CertificateThumbprint,
    [Parameter(Mandatory = $true)][string]$Organization,
    [ValidateSet('Probe', 'WaitMailbox')][string]$Mode = 'Probe',
    [string]$UserPrincipalName,
    [ValidateRange(1, 120)][int]$TimeoutMinutes = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    $null = Connect-ExchangeOnline `
        -AppId $ClientId `
        -CertificateThumbprint $CertificateThumbprint `
        -Organization $Organization `
        -ShowBanner:$false

    if ($Mode -eq 'Probe') {
        $null = Get-EXOMailbox -ResultSize 1 -ErrorAction Stop
        [pscustomobject]@{ success = $true; mailboxId = $null } | ConvertTo-Json -Compress
        exit 0
    }

    if ([string]::IsNullOrWhiteSpace($UserPrincipalName)) {
        throw 'UserPrincipalName ist fuer WaitMailbox erforderlich.'
    }

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $mailbox = $null
    do {
        try { $mailbox = Get-EXOMailbox -Identity $UserPrincipalName -ErrorAction Stop } catch { $mailbox = $null }
        if (-not $mailbox) { Start-Sleep -Seconds 20 }
    } until ($mailbox -or (Get-Date) -ge $deadline)

    if (-not $mailbox) {
        throw "Das Exchange-Online-Postfach $UserPrincipalName ist nach $TimeoutMinutes Minuten noch nicht sichtbar."
    }

    [pscustomobject]@{
        success = $true
        mailboxId = [string]$mailbox.ExternalDirectoryObjectId
    } | ConvertTo-Json -Compress
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
}
