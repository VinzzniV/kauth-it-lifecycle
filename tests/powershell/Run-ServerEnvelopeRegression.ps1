[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SavedJobPath,[int]$GatewayPort=20789)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major-ne5){throw 'Windows PowerShell 5.1 required.'}
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$workspace=Join-Path ([IO.Path]::GetTempPath()) ('it-lifecycle-envelope-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workspace|Out-Null
$job=Get-Content -LiteralPath $SavedJobPath -Raw -Encoding UTF8|ConvertFrom-Json
if($job.requestedMode-ne'WhatIf'){throw 'Regression accepts only a saved WhatIf envelope.'}
foreach($name in @('adCredential','helpdeskCredential','initialPassword','runId')){$job.PSObject.Properties.Remove($name)}
$job|Add-Member -NotePropertyName runId -NotePropertyValue $job.jobId
$job|Add-Member -NotePropertyName adCredential -NotePropertyValue @{username='adapter';password='isolated-test-secret'}
$job|Add-Member -NotePropertyName helpdeskCredential -NotePropertyValue @{username='adapter';password='isolated-test-secret'}
$job|Add-Member -NotePropertyName initialPassword -NotePropertyValue 'isolated-test-secret'
$statePath=Join-Path $workspace 'adapter.json'
@{mutations=0;users=@();computers=@();groups=@();tickets=@();cloudUser=@{Id='cloud';UserPrincipalName='test@example.invalid';UsageLocation='DE';AssignedLicenses=@()};sku=@{SkuId='sku';SkuPartNumber='SPB';PrepaidUnits=@{Enabled=2;Warning=0};ConsumedUnits=0}}|ConvertTo-Json -Depth 20|Set-Content $statePath -Encoding UTF8
$configurationPath=Join-Path $workspace '.env'
@('IT_LIFECYCLE_TEST_MODE=1',('IT_LIFECYCLE_TEST_STATE='+$statePath),'MANAGEMENT_AGENT_TOKEN=isolated-test-token','IT_LIFECYCLE_WEB_URL=http://127.0.0.1:20082',('AD_DOMAIN='+$job.directory.domain))|Set-Content $configurationPath -Encoding UTF8
$process=$null
try {
    $process=Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',('"'+(Join-Path $root 'public\agent\Start-ItLifecycleGateway.ps1')+'"'),'-ListenPrefix',"http://127.0.0.1:$GatewayPort/",'-QueuePath',('"'+(Join-Path $workspace 'queue')+'"'),'-ConfigurationPath',('"'+$configurationPath+'"'),'-TestAdapterPath',('"'+(Join-Path $PSScriptRoot 'TestAdapter.ps1')+'"')) -RedirectStandardOutput (Join-Path $workspace 'gateway.log') -RedirectStandardError (Join-Path $workspace 'gateway-error.log')
    $deadline=(Get-Date).AddSeconds(30)
    do {try{$ready=(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$GatewayPort/health" -TimeoutSec 3).StatusCode-eq200}catch{$ready=$false};if(-not$ready){Start-Sleep -Milliseconds 200}}until($ready-or(Get-Date)-ge$deadline)
    if(-not$ready){throw 'Isolated gateway did not start.'}
    $bytes=[Text.Encoding]::UTF8.GetBytes(($job|ConvertTo-Json -Depth 30 -Compress))
    try{$response=Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$GatewayPort/jobs" -Method Post -Headers @{Authorization='Bearer isolated-test-token'} -ContentType 'application/json; charset=utf-8' -Body $bytes}catch{Get-Content (Join-Path $workspace 'gateway.log');throw ('Server envelope HTTP submission failed; inspect '+$workspace)}
    if($response.StatusCode-ne202){throw 'Saved server envelope was not accepted.'}
    $persistedPath=Join-Path $workspace ('queue\'+$job.jobId+'.json')
    if(-not(Test-Path $persistedPath)){throw 'Accepted server envelope has no durable job.'}
    $persisted=Get-Content $persistedPath -Raw|ConvertFrom-Json
    if($persisted.runId-ne$job.jobId-or$persisted.requestedMode-ne'WhatIf'-or$persisted.PSObject.Properties['adCredential']){throw 'Stored job contract or credential removal failed.'}
    foreach($secretName in @('adCredential','helpdeskCredential','initialPassword')){if($persisted.PSObject.Properties[$secretName]){throw 'Credential field persisted in stored job.'}}
    @{powershell=$PSVersionTable.PSVersion.ToString();passed='Exact saved server envelope accepted over HTTP and durably persisted without credentials';workspace=$workspace}|ConvertTo-Json
} finally {if($process-and-not$process.HasExited){Stop-Process -Id $process.Id -Force}}
