[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Revision,
    [Parameter(Mandatory=$true)][ValidatePattern('^kauth/it-lifecycle:[a-zA-Z0-9._-]+$')][string]$Image,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$Volume,
    [Parameter(Mandatory=$true)][string]$BackupDirectory,
    [string]$TaskName='Kauth-ITLifecycle-Gateway',
    [string]$ConfigurationPath=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try{
    if(-not$ConfigurationPath){$ConfigurationPath=Join-Path $PSScriptRoot '.env'}
    if(-not(Test-Path -LiteralPath $ConfigurationPath)){throw 'Local configuration missing.'}
    . (Join-Path $PSScriptRoot 'public\agent\Import-ItLifecycleEnv.ps1')
    $settings=Import-ItLifecycleEnv $ConfigurationPath
    $compose=@('compose','--env-file',$ConfigurationPath)
    if($settings.ContainsKey('WEB_TLS_HOST')-and $settings['WEB_TLS_HOST']){$compose+=@('--profile','https')}
    $head=git rev-parse HEAD;if($LASTEXITCODE-ne0-or $head-ne$Revision){throw 'Working copy must already be the reviewed exact revision; no automatic branch update.'}
    if(git status --porcelain --untracked-files=no){throw 'Tracked working copy changes must be reviewed before update.'}
    $imageRevision=docker image inspect $Image --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
    if($LASTEXITCODE-ne0-or $imageRevision-ne$Revision){throw 'Reviewed image must exist and carry the exact revision label.'}
    $queue=if($env:MANAGEMENT_AGENT_QUEUE_PATH){$env:MANAGEMENT_AGENT_QUEUE_PATH}else{"$env:ProgramData\Kauth\ITLifecycle\Queue"}
    $active=@(Get-ChildItem $queue -Filter '*.state.json' -ErrorAction SilentlyContinue|Where-Object{-not(Test-Path ($_.FullName-replace '\.state\.json$','.result.json'))})
    $pending=@(Get-ChildItem $queue -Filter '*.result.json' -ErrorAction SilentlyContinue|Where-Object{-not(Test-Path ($_.FullName-replace '\.result\.json$','.ack.json'))})
    if($active.Count-or $pending.Count){throw 'Drain gateway jobs and result imports before update.'}
    $container=if($env:APP_CONTAINER_NAME){$env:APP_CONTAINER_NAME}else{'kauth-it-lifecycle'}
    $mounted=docker inspect $container --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}'
    if($LASTEXITCODE-ne0-or $mounted-ne$Volume){throw 'Explicit backup volume does not match the running application volume.'}
    $previousImage=docker inspect $container --format '{{.Image}}'
    $configuredVolume=if($env:APP_VOLUME_NAME){$env:APP_VOLUME_NAME}else{'kauth_it_lifecycle_data'}
    if($configuredVolume-ne$Volume){throw 'Configured application volume differs from the explicitly verified source volume.'}
    Write-Host "Previous image: $previousImage; backup: $BackupDirectory; source volume: $Volume"
    # Close new submission first; require a drained queue again before stopping gateway.
    & docker @compose stop;if($LASTEXITCODE-ne0){throw 'Web stop failed.'}
    $active=@(Get-ChildItem $queue -Filter '*.state.json' -ErrorAction SilentlyContinue|Where-Object{-not(Test-Path ($_.FullName-replace '\.state\.json$','.result.json'))})
    if($active.Count){throw 'Job arrived during maintenance entry; let gateway finish before update.'}
    Stop-ScheduledTask -TaskName $TaskName
    & (Join-Path $PSScriptRoot 'Manage-ItLifecycle.ps1') -Command Backup -Image $Image -Volume $Volume -BackupDirectory $BackupDirectory -ConfigurationPath $ConfigurationPath
    $env:RELEASE_TAG=$Image.Substring('kauth/it-lifecycle:'.Length);$env:GIT_REVISION=$Revision
    & docker @compose up -d --no-build;if($LASTEXITCODE-ne0){throw 'Deployment start failed; restore the saved backup to a new volume before returning to the previous image.'}
    $deadline=(Get-Date).AddMinutes(2);$healthy=$false
    do{
        $status=docker inspect $container --format '{{.State.Health.Status}}'
        if($LASTEXITCODE-eq0-and $status-eq'healthy'){$healthy=$true;break};Start-Sleep -Seconds 2
    }while((Get-Date)-lt$deadline)
    if(-not$healthy){throw 'Web health gate failed; inspect logs and restore backup to a separate volume for return.'}
    Start-ScheduledTask -TaskName $TaskName
    $gatewayHealth=Invoke-WebRequest -UseBasicParsing -Uri "$($env:MANAGEMENT_AGENT_URL.TrimEnd('/'))/health" -TimeoutSec 15
    if($gatewayHealth.StatusCode-ne200){throw 'Gateway health gate failed.'}
    Write-Host "Deployment healthy at reviewed revision $Revision. Keep the previous image and backup for return."
}finally{Pop-Location}
