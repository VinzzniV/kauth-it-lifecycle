[CmdletBinding()]
param([string]$Workspace='', [int]$GatewayPort=19788, [int]$ReceiverPort=19081)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5){throw 'Windows PowerShell 5.1 required.'}
Import-Module ([IO.Path]::Combine($PSHOME, 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')) -ErrorAction Stop
if(-not $Workspace){$Workspace=Join-Path ([IO.Path]::GetTempPath()) ('it-lifecycle-gateway-'+[guid]::NewGuid().ToString('N'))}
New-Item -ItemType Directory -Path $Workspace -Force|Out-Null
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$queue=Join-Path $Workspace 'queue';$envPath=Join-Path $Workspace '.env';$statePath=Join-Path $Workspace 'adapter.json'
@{mutations=0;users=@();computers=@();groups=@();tickets=@();cloudUser=@{Id='cloud';UserPrincipalName='test@kauth.local';UsageLocation='DE';AssignedLicenses=@()};sku=@{SkuId='sku';SkuPartNumber='SPB';PrepaidUnits=@{Enabled=2;Warning=0};ConsumedUnits=0}}|ConvertTo-Json -Depth 20|Set-Content $statePath -Encoding UTF8
@("IT_LIFECYCLE_TEST_MODE=1","IT_LIFECYCLE_TEST_STATE=$statePath",'IT_LIFECYCLE_TEST_DELAY_SECONDS=12','MANAGEMENT_AGENT_TOKEN=isolated-test-token',"IT_LIFECYCLE_WEB_URL=http://127.0.0.1:$ReceiverPort",'AD_DOMAIN=isolated.local','M365_TENANT_ID=test','M365_CLIENT_ID=test','M365_CERT_THUMBPRINT=test','M365_ORGANIZATION=test')|Set-Content $envPath -Encoding UTF8
$receiver=$null;$gateway=$null;$passed=[Collections.Generic.List[string]]::new()
function Assert {param([bool]$Condition,[string]$Message);if(-not $Condition){throw $Message}}
function Wait-Until {param([scriptblock]$Condition,[int]$Seconds=40)
    $deadline=(Get-Date).AddSeconds($Seconds)
    while((Get-Date)-lt $deadline){if(& $Condition){return};Start-Sleep -Milliseconds 200};throw 'Timed out awaiting isolated test state.'
}
function Start-Gateway {
    return Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',('"'+(Join-Path $root 'public\agent\Start-ItLifecycleGateway.ps1')+'"'),'-ListenPrefix',"http://127.0.0.1:$GatewayPort/",'-QueuePath',('"'+$queue+'"'),'-ConfigurationPath',('"'+$envPath+'"'),'-TestAdapterPath',('"'+(Join-Path $PSScriptRoot 'TestAdapter.ps1')+'"')) -RedirectStandardOutput (Join-Path $Workspace 'gateway-out.log') -RedirectStandardError (Join-Path $Workspace 'gateway-error.log')
}
function Post-Job {param($Job)
    return Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$GatewayPort/jobs" -Method Post -Headers @{Authorization='Bearer isolated-test-token'} -ContentType 'application/json' -Body ($Job|ConvertTo-Json -Depth 20 -Compress)
}
function Reconcile {param([string]$Id)
    return Invoke-RestMethod "http://127.0.0.1:$GatewayPort/jobs/reconcile" -Method Post -Headers @{Authorization='Bearer isolated-test-token'} -ContentType 'application/json' -Body (@{jobId=$Id}|ConvertTo-Json -Compress)
}
try{
    $receiver=Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',('"'+(Join-Path $PSScriptRoot 'ResultReceiver.ps1')+'"'),'-Port',$ReceiverPort,'-Workspace',('"'+$Workspace+'"'))
    $gateway=Start-Gateway
    Wait-Until {try{(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$GatewayPort/health" -TimeoutSec 2).StatusCode -eq 200}catch{$false}}
    foreach($attempt in 1..3) {
        $client=[Net.Sockets.TcpClient]::new('127.0.0.1',$GatewayPort)
        try{$client.Client.LingerState=[Net.Sockets.LingerOption]::new($true,0);$bytes=[Text.Encoding]::ASCII.GetBytes("GET /health HTTP/1.1`r`nHost: 127.0.0.1`r`nConnection: close`r`n`r`n");$client.GetStream().Write($bytes,0,$bytes.Length)}finally{$client.Dispose()}
    }
    Wait-Until {try{(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$GatewayPort/health" -TimeoutSec 2).StatusCode-eq200}catch{$false}}
    $passed.Add('Aborted HTTP clients leave gateway listening')
    $job=@{schemaVersion=1;jobId='job-gateway';runId='job-gateway';operation='execute';requestedMode='Execute';executeApproved=$true;lifecycleType='onboarding';person=@{employeeId='employee-test';displayName='Test'};directory=@{domain='isolated.local';samAccountName='test';userPrincipalName='test@kauth.local';targetOu='OU=Test,DC=kauth,DC=local'};actions=@(@{type='ProvisionM365Mailbox';target='Test'});microsoft365=@{syncServer='isolated';skuPartNumber='SPB';usageLocation='DE';userSyncTimeoutMinutes=0;mailboxTimeoutMinutes=0};automationTaskIds=@();adCredential=@{username='test';password='test-secret'}}
    Assert ((Post-Job $job).StatusCode -eq 202) 'Job not accepted'
    Assert ((Post-Job $job).StatusCode -eq 202) 'Duplicate job not idempotent'
    $conflict=$job.Clone();$conflict.actions=@(@{type='CreateHelpdeskTicket';target='other'});$status=0
    try{Post-Job $conflict|Out-Null}catch{$status=[int]$_.Exception.Response.StatusCode};Assert ($status-eq409) 'ID reuse with changed actions accepted'
    $passed.Add('Authenticated acceptance plus exact job-ID deduplication')
    $bad=$job.Clone();$bad.jobId='job-invalid';$bad.runId='job-invalid';$bad.Remove('actions');$rejection=$null
    try{Post-Job $bad|Out-Null}catch{$reader=[IO.StreamReader]::new($_.Exception.Response.GetResponseStream());try{$rejection=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}}
    Assert ($null-ne$rejection-and $rejection.accepted-eq$false-and $rejection.noExecution-eq$true) 'Invalid contract was not definitively rejected before execution'
    Assert (-not(Test-Path (Join-Path $queue 'job-invalid.json'))) 'Invalid job persisted'
    $passed.Add('Validation rejection proves accepted=false and no execution')
    foreach($operation in @('reference_check','rollback')) {
        $bad=$job.Clone();$bad.jobId='job-invalid-'+$operation;$bad.runId=$bad.jobId;$bad.operation=$operation;$bad.Remove('actions');$rejection=$null;$status=0
        try{Post-Job $bad|Out-Null}catch{$status=[int]$_.Exception.Response.StatusCode;$reader=[IO.StreamReader]::new($_.Exception.Response.GetResponseStream());try{$rejection=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}}
        Assert ($status-eq400-and $null-ne$rejection-and $rejection.accepted-eq$false-and $rejection.noExecution-eq$true) 'Incomplete operation contract was accepted'
        Assert (-not(Test-Path (Join-Path $queue ($bad.jobId+'.json')))) 'Invalid operation persisted'
    }
    $passed.Add('Reference/rollback reject missing operation fields before queue persistence')
    $reconciled=Reconcile 'job-gateway'
    Assert ($reconciled.status-in@('accepted','running')-and $reconciled.noExecution-eq$false) 'Accepted/running reconciliation falsely proved no effect'
    Wait-Until { $path=Join-Path $queue 'job-gateway.state.json';(Test-Path $path)-and ((Get-Content $path -Raw|ConvertFrom-Json).status -eq 'running') }
    $processState=Get-Content (Join-Path $queue 'job-gateway.state.json') -Raw|ConvertFrom-Json
    Stop-Process -Id $gateway.Id -Force;$gateway.WaitForExit();$gateway=Start-Gateway
    Wait-Until {try{(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$GatewayPort/health" -TimeoutSec 2).StatusCode-eq200}catch{$false}}
    Wait-Until {Test-Path (Join-Path $queue 'job-gateway.result.json')}
    Assert (-not(Test-Path (Join-Path $queue 'job-gateway.ack.json'))) 'Unavailable web result falsely acknowledged'
    $result=Get-Content (Join-Path $queue 'job-gateway.result.json') -Raw|ConvertFrom-Json
    Assert ($result.status-eq'completed') 'Live child became uncertain after gateway restart'
    Assert ((Get-Content $statePath -Raw|ConvertFrom-Json).mutations-eq2) 'Restart repeated cloud mutations'
    $passed.Add('Gateway restart retains live child; browser-independent durable result')
    New-Item -ItemType File -Path (Join-Path $Workspace 'allow-import')|Out-Null
    Wait-Until {Test-Path (Join-Path $queue 'job-gateway.ack.json')}
    Assert (Test-Path (Join-Path $Workspace 'job-gateway.received.json')) 'Authenticated receiver did not save result'
    $reconciled=Reconcile 'job-gateway'
    Assert ($reconciled.status-eq'completed'-and $reconciled.noExecution-eq$false-and $reconciled.result.jobId-eq'job-gateway') 'Completed reconciliation did not return original result'
    $passed.Add('Unavailable receiver retry, then durable ACK without browser polling')
    $orphan=$job.Clone();$orphan.jobId='job-orphan';$orphan.runId='job-orphan';$orphan.Remove('adCredential');$orphan|ConvertTo-Json -Depth 20|Set-Content (Join-Path $queue 'job-orphan.json') -Encoding UTF8
    @{status='running';pid=2147483647;startTicks='0'}|ConvertTo-Json|Set-Content (Join-Path $queue 'job-orphan.state.json') -Encoding UTF8
    Wait-Until {Test-Path (Join-Path $queue 'job-orphan.ack.json')}
    $result=Get-Content (Join-Path $queue 'job-orphan.result.json') -Raw|ConvertFrom-Json
    Assert ($result.status-eq'review_required') 'Uncertain orphan replayed or became retryable'
    $passed.Add('Missing child produces review_required and is never replayed')
    # Persisted job before acceptance-marker flush: provably never started.
    Stop-Process -Id $gateway.Id -Force;$gateway.WaitForExit()
    $pendingJob=$job.Clone();$pendingJob.jobId='job-pending';$pendingJob.runId='job-pending';$pendingJob.Remove('adCredential');$pendingJob|ConvertTo-Json -Depth 20|Set-Content (Join-Path $queue 'job-pending.json') -Encoding UTF8
    $credential=New-Object Management.Automation.PSCredential('test',(ConvertTo-SecureString 'test-secret' -AsPlainText -Force));$credential|Export-Clixml (Join-Path $queue 'job-pending.ad.credential.xml')
    $gateway=Start-Gateway
    Wait-Until {Test-Path (Join-Path $queue 'job-pending.ack.json')}
    Assert ((Get-Content (Join-Path $queue 'job-pending.result.json') -Raw|ConvertFrom-Json).status-eq'completed') 'Never-started persisted job was stranded'
    Assert ((Get-Content $statePath -Raw|ConvertFrom-Json).mutations-eq3) 'Pending recovery repeated licensed action'
    $passed.Add('Job/acceptance crash gap recovers only provably never-started job')
    $orphanCredential=Join-Path $queue 'job-unused.ad.credential.xml';$credential|Export-Clixml $orphanCredential
    Wait-Until {-not(Test-Path $orphanCredential)}
    $passed.Add('Credential orphan before job persistence is cleaned without execution')
    $reconciled=Reconcile 'job-delayed'
    Assert ($reconciled.status-eq'not_accepted'-and $reconciled.noExecution-eq$true-and (Test-Path (Join-Path $queue 'job-delayed.not-accepted.json'))) 'Missing job has no durable nonacceptance proof'
    # Tombstone survives restart before the delayed original HTTP POST arrives.
    Stop-Process -Id $gateway.Id -Force;$gateway.WaitForExit();$gateway=Start-Gateway
    Wait-Until {try{(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$GatewayPort/health" -TimeoutSec 2).StatusCode-eq200}catch{$false}}
    $delayed=$job.Clone();$delayed.jobId='job-delayed';$delayed.runId='job-delayed';$rejection=$null;$status=0
    try{Post-Job $delayed|Out-Null}catch{$status=[int]$_.Exception.Response.StatusCode;$reader=[IO.StreamReader]::new($_.Exception.Response.GetResponseStream());try{$rejection=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}}
    Assert ($status-eq409-and $rejection.accepted-eq$false-and $rejection.noExecution-eq$true) 'Delayed original POST escaped reconciliation tombstone'
    Assert (-not(Test-Path (Join-Path $queue 'job-delayed.json'))-and -not(Test-Path (Join-Path $queue 'job-delayed.state.json'))) 'Delayed job started after no-execution proof'
    $reconciled=Reconcile 'job-delayed';Assert ($reconciled.status-eq'not_accepted'-and $reconciled.noExecution-eq$true) 'Repeated reconciliation lost nonacceptance proof'
    $passed.Add('Authenticated reconciliation reports accepted/running/completed without claiming no effect')
    $passed.Add('Durable reconciliation tombstone blocks delayed original POST after restart')
    @{powershell=$PSVersionTable.PSVersion.ToString();passed=$passed;workspace=$Workspace}|ConvertTo-Json -Depth 8
} finally {foreach($process in @($gateway,$receiver)){if($process-and -not $process.HasExited){Stop-Process -Id $process.Id -Force}}}
