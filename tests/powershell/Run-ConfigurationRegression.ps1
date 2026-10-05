[CmdletBinding()]
param([string]$Workspace='')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major-ne5){throw 'Windows PowerShell 5.1 required.'}
if(-not$Workspace){$Workspace=Join-Path ([IO.Path]::GetTempPath()) ('it-lifecycle-config-'+[guid]::NewGuid().ToString('N'))}
New-Item -ItemType Directory -Path $Workspace -Force|Out-Null
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$path=Join-Path $Workspace '.env'
function Read-Host {param([string]$Prompt,[switch]$AsSecureString);return ''}
& (Join-Path $root 'Configure-ItLifecycle.ps1') -ConfigurationPath $path|Out-Null
$broad=@((Get-Acl -LiteralPath $path).Access|Where-Object{$_.AccessControlType-eq'Allow'-and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value-in@('S-1-1-0','S-1-5-11','S-1-5-32-545')})
if($broad.Count){throw 'New .env has broad local access.'}
Add-Content -LiteralPath $path -Value 'CUSTOM_EXISTING_VALUE=preserved' -Encoding UTF8
$before=Get-Content $path -Raw -Encoding UTF8
& (Join-Path $root 'Configure-ItLifecycle.ps1') -ConfigurationPath $path|Out-Null
$after=Get-Content $path -Raw -Encoding UTF8
if($after-notmatch 'CUSTOM_EXISTING_VALUE=preserved'){throw 'Reconfiguration lost unknown existing settings.'}
$beforeSecret=[regex]::Match($before,'(?m)^MANAGEMENT_AGENT_TOKEN=(.*)$').Groups[1].Value
$afterSecret=[regex]::Match($after,'(?m)^MANAGEMENT_AGENT_TOKEN=(.*)$').Groups[1].Value
if($beforeSecret-ne$afterSecret){throw 'Reconfiguration silently rotated token.'}
@{powershell=$PSVersionTable.PSVersion.ToString();passed=@('New config ACL limited to operator/SYSTEM/Administrators','Existing configuration keys preserved','Existing token preserved');workspace=$Workspace}|ConvertTo-Json
