# Operational entrypoints also need their own built-in modules when launched by Node/PowerShell 7.
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules') + [IO.Path]::PathSeparator + $env:PSModulePath

function Import-ItLifecycleEnv {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Zentrale Konfiguration nicht gefunden: $Path. Fuehre zuerst .\Configure-ItLifecycle.ps1 aus."
    }

    $settings = @{}
    foreach ($sourceLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = ([string]$sourceLine).Trim().TrimStart([char]0xFEFF)
        if (-not $line -or $line.StartsWith('#')) { continue }
        if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
        $name = $matches[1]
        $value = $matches[2].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $settings[$name] = $value
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
    return $settings
}

function Protect-NewItLifecycleConfiguration {
    param([Parameter(Mandatory=$true)][string]$Path)
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $identities = @([Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    foreach ($identity in $identities) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow'))) }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
