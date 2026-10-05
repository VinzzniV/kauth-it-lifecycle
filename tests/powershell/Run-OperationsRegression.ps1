[CmdletBinding()]
param([string]$Workspace='',[string]$BackupArchive='',[string]$Image='')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major-ne5){throw 'Windows PowerShell 5.1 required.'}
if(-not$Workspace){$Workspace=Join-Path ([IO.Path]::GetTempPath()) ('it-lifecycle-ops-'+[guid]::NewGuid().ToString('N'))}
New-Item -ItemType Directory -Path $Workspace -Force|Out-Null
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$configPath=Join-Path $Workspace '.env'
@('IT_LIFECYCLE_TEST_MODE=1','APP_USERNAME=isolated-test','APP_PASSWORD=isolated-password','MANAGEMENT_AGENT_TOKEN=isolated-token','MANAGEMENT_AGENT_URL=https://localhost:28788','IT_LIFECYCLE_WEB_URL=https://localhost:28443','MANAGEMENT_AGENT_LISTEN_PREFIX=https://+:28788/',"MANAGEMENT_AGENT_QUEUE_PATH=$(Join-Path $Workspace 'queue')")|Set-Content $configPath -Encoding UTF8
$passed=[Collections.Generic.List[string]]::new()
$manager=Join-Path $root 'Manage-ItLifecycle.ps1'
$output=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $manager -Command Check -ConfigurationPath $configPath 2>&1
if($LASTEXITCODE-ne0){throw ($output-join ' ')}
$passed.Add('Explicit shared configuration passes Docker Compose and gateway check under PS5.1')
$output=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $manager -Command Setup -ConfigurationPath $configPath -Identity 'ISOLATED\delegated$' -HttpsThumbprint ('0'*40) -GatewayRemoteAddress '127.0.0.1' -WebRemoteAddress '127.0.0.1' 2>&1
if($LASTEXITCODE-ne0-or ($output-join ' ')-notmatch 'Prepared only'){throw 'Setup did not remain a prepared plan.'}
if(Test-Path (Join-Path $Workspace 'queue')){throw 'Prepared setup created a queue.'}
$passed.Add('Setup includes HTTPS and explicit firewall sources; default invocation performs no system mutation')
$update=Join-Path $root 'Update-Server.ps1'
$ErrorActionPreference='Continue'
$output=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $update -ConfigurationPath $configPath -Revision ('0'*40) -Image 'kauth/it-lifecycle:isolated-test' -Volume 'isolated-never-created' -BackupDirectory (Join-Path $Workspace 'backup') 2>&1
$ErrorActionPreference='Stop'
if($LASTEXITCODE-eq0-or ($output-join ' ')-notmatch 'reviewed exact revision'){throw 'Update did not reject an unreviewed revision before maintenance.'}
$passed.Add('Update rejects unreviewed revision before stopping or changing any component')
$ErrorActionPreference='Continue'
$output=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $manager -Command Restore -ConfigurationPath $configPath -Image 'kauth/it-lifecycle:isolated-test' -Volume 'invalid/volume' -BackupDirectory $Workspace 2>&1
$ErrorActionPreference='Stop'
if($LASTEXITCODE-eq0-or ($output-join ' ')-notmatch 'new explicit Volume'){throw 'Restore accepted invalid target volume.'}
$passed.Add('Restore rejects invalid volume before creating or modifying data')

if($BackupArchive){
    if(-not$Image){throw 'An existing tested image is required for cold-archive restore regression.'}
    $newVolume='it_lifecycle_ops_restore_'+[guid]::NewGuid().ToString('N')
    $ErrorActionPreference='Continue'
    $output=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $manager -Command Restore -ConfigurationPath $configPath -Image $Image -Volume $newVolume -BackupDirectory $BackupArchive 2>&1
    $ErrorActionPreference='Stop'
    if($LASTEXITCODE-ne0){throw ($output-join ' ')}
    $created=& docker volume inspect $newVolume --format '{{.Name}}'
    if($LASTEXITCODE-ne0-or$created-ne$newVolume){throw 'Restore did not create the isolated volume.'}
    $passed.Add('Restore accepts a missing new volume and a cold archive under real Windows PowerShell5.1')
    $ErrorActionPreference='Continue'
    $output=& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $manager -Command Restore -ConfigurationPath $configPath -Image $Image -Volume $newVolume -BackupDirectory $BackupArchive 2>&1
    $ErrorActionPreference='Stop'
    if($LASTEXITCODE-eq0-or($output-join ' ')-notmatch 'NEW volume'){throw 'Restore did not reject an existing isolated volume.'}
    $passed.Add('Restore refuses to overwrite the volume created by the successful restore')
}
@{powershell=$PSVersionTable.PSVersion.ToString();passed=$passed;workspace=$Workspace}|ConvertTo-Json
