[CmdletBinding()]
param([string]$ListenPrefix = '', [string]$QueuePath = '', [string]$ConfigurationPath = '', [string]$TestAdapterPath = '')
# Node/PowerShell 7 parents can omit the Windows PowerShell built-in modules.
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules') + [IO.Path]::PathSeparator + $env:PSModulePath
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ConfigurationPath) { $ConfigurationPath = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '.env' }
. (Join-Path $PSScriptRoot 'Import-ItLifecycleEnv.ps1')
$settings = Import-ItLifecycleEnv -Path $ConfigurationPath
$env:IT_LIFECYCLE_TEST_MODE = if ($settings.ContainsKey('IT_LIFECYCLE_TEST_MODE')) { [string]$settings['IT_LIFECYCLE_TEST_MODE'] } else { '0' }
if (-not $ListenPrefix) { $ListenPrefix = if ($env:MANAGEMENT_AGENT_LISTEN_PREFIX) { $env:MANAGEMENT_AGENT_LISTEN_PREFIX } else { 'https://+:8788/' } }
if (-not $QueuePath) { $QueuePath = if ($env:MANAGEMENT_AGENT_QUEUE_PATH) { $env:MANAGEMENT_AGENT_QUEUE_PATH } else { "$env:ProgramData\Kauth\ITLifecycle\Queue" } }
if (($ListenPrefix -notlike 'https://*' -or $TestAdapterPath) -and $env:IT_LIFECYCLE_TEST_MODE -ne '1') { throw 'HTTPS is required; adapters require isolated test mode.' }
$token = [string]$env:MANAGEMENT_AGENT_TOKEN
$webUrl = [string]$env:IT_LIFECYCLE_WEB_URL
$configuredDomain = if ($env:AD_DOMAIN) { $env:AD_DOMAIN.Trim() } else { 'kauth.local' }
if (-not $token -or -not $webUrl) { throw 'MANAGEMENT_AGENT_TOKEN and IT_LIFECYCLE_WEB_URL are required.' }
$webUri = [uri]$webUrl
if (($webUri.Scheme -ne 'https' -and $env:IT_LIFECYCLE_TEST_MODE -ne '1') -or $webUri.UserInfo -or $webUri.Query -or $webUri.Fragment) { throw 'Invalid or insecure web URL.' }
New-Item -ItemType Directory -Path $QueuePath -Force | Out-Null
if ($env:IT_LIFECYCLE_TEST_MODE -ne '1') {
    foreach ($path in @($ConfigurationPath, $QueuePath)) {
        foreach ($rule in (Get-Acl -LiteralPath $path).Access) {
            $sid = try { $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { '' }
            if ($rule.AccessControlType -eq 'Allow' -and $sid -in @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')) { throw 'Configuration/queue grants broad local access. Apply the reviewed ACL setup before gateway startup.' }
        }
    }
}
$queueLock = [IO.File]::Open((Join-Path $QueuePath 'gateway.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$listener = [Net.HttpListener]::new(); $listener.Prefixes.Add($ListenPrefix)
function Write-AtomicJson { param([string]$Path, $Value)
    $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath "$Path.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$Path.tmp" -Destination $Path -Force
}
function QueueFile { param([string]$Id, [string]$Suffix); return Join-Path $QueuePath "$Id$Suffix" }
function Export-Credential { param($Spec, [string]$Path)
    if (-not $Spec.username -or -not $Spec.password -or ([string]$Spec.password).Length -gt 512) { throw 'Invalid credential.' }
    $secure = ConvertTo-SecureString ([string]$Spec.password) -AsPlainText -Force
    [Management.Automation.PSCredential]::new([string]$Spec.username, $secure) | Export-Clixml -LiteralPath $Path
}
function Cleanup { param([string]$Id)
    foreach ($suffix in @('.ad.credential.xml', '.helpdesk.credential.xml', '.initial.credential.xml')) { Remove-Item -LiteralPath (QueueFile $Id $suffix) -Force -ErrorAction SilentlyContinue }
}
function Start-PendingJob { param([string]$Id)
    $jobPath = QueueFile $Id '.json'; $job = Get-Content $jobPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"' + (Join-Path $PSScriptRoot 'Invoke-ItLifecycleAgent.ps1') + '"'), '-JobPath', ('"' + $jobPath + '"'), '-Mode', $job.requestedMode)
    foreach ($entry in @(@('.ad.credential.xml', '-CredentialPath'), @('.helpdesk.credential.xml', '-HelpdeskCredentialPath'), @('.initial.credential.xml', '-InitialPasswordPath'))) {
        $path = QueueFile $Id $entry[0]
        if (Test-Path -LiteralPath $path) { $arguments += @($entry[1], ('"' + $path + '"')) }
    }
    if ($TestAdapterPath) { $arguments += @('-TestAdapterPath', ('"' + $TestAdapterPath + '"')) }
    Write-AtomicJson (QueueFile $Id '.state.json') @{ status = 'starting'; pid = 0; startTicks = ''; createdAt = (Get-Date).ToString('o') }
    try {
        $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
        Write-AtomicJson (QueueFile $Id '.state.json') @{ status = 'running'; pid = $process.Id; startTicks = $process.StartTime.ToUniversalTime().Ticks.ToString(); createdAt = (Get-Date).ToString('o') }
    } catch { Uncertain $Id }
}
function Uncertain { param([string]$Id)
    $job = Get-Content -LiteralPath (QueueFile $Id '.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $now = (Get-Date).ToString('o'); $actions = @()
    if ($job.PSObject.Properties['actions']) { $actions = @($job.actions | ForEach-Object { @{ action = $_.type; status = 'review_required'; error = 'Process outcome uncertain; inspect external systems before retry.' } }) }
    Write-AtomicJson (QueueFile $Id '.result.json') @{
        schemaVersion = 1; jobId = $job.jobId; runId = $job.runId; employeeId = $job.person.employeeId; operation = $job.operation; mode = $job.requestedMode
        status = 'review_required'; relatedRunId = $(if ($job.operation -eq 'rollback') { $job.originalRun.id } elseif ($job.PSObject.Properties['retryOfRunId']) { $job.retryOfRunId } else { $null })
        startedAt = $now; completedAt = $now; error = 'Process outcome uncertain; manual review required.'
        automationTaskIds = @(); actionResults = $actions; changes = @(); log = @(); referenceLookup = $null
        computerName = $env:COMPUTERNAME; operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    }
    Cleanup $Id
}
function Sync-Queue {
    $busy = $false; $waiting = [Collections.Generic.List[string]]::new()
    # The job is flushed before its acceptance marker. A crash in this gap
    # cannot have started an agent (starting marker is always written first).
    foreach ($jobFile in Get-ChildItem -LiteralPath $QueuePath -Filter '*.json' -File) {
        if ($jobFile.Name -notmatch '^([a-zA-Z0-9_-]{1,120})\.json$') { continue }
        $id = $matches[1]
        if (-not (Test-Path -LiteralPath (QueueFile $id '.state.json'))) { Write-AtomicJson (QueueFile $id '.state.json') @{ status = 'accepted'; pid = 0; startTicks = ''; createdAt = $jobFile.CreationTime.ToString('o') } }
    }
    foreach ($credentialFile in Get-ChildItem -LiteralPath $QueuePath -Filter '*.credential.xml' -File) {
        if ($credentialFile.Name -match '^([a-zA-Z0-9_-]{1,120})\.(ad|helpdesk|initial)\.credential\.xml$') {
            if (-not (Test-Path -LiteralPath (QueueFile $matches[1] '.json'))) { Remove-Item -LiteralPath $credentialFile.FullName -Force }
        }
    }
    foreach ($file in Get-ChildItem -LiteralPath $QueuePath -Filter '*.state.json' -File) {
        $id = $file.Name.Substring(0, $file.Name.Length - 11); $resultPath = QueueFile $id '.result.json'
        if (-not (Test-Path -LiteralPath $resultPath)) {
            $state = Get-Content $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json; $live = $false
            if ($state.status -eq 'accepted') { $waiting.Add($id); continue }
            if ($state.status -eq 'starting' -and -not $state.pid) {
                $jobPath = QueueFile $id '.json'
                $matches = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($jobPath) })
                if ($matches.Count -gt 0) { $busy = $true; continue }
            }
            if ($state.pid) {
                $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
                if ($process) { try { $live = $process.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$state.startTicks } catch { $live = $true } }
            }
            if ($live) { $busy = $true; continue }; Uncertain $id
        }
        $ackPath = QueueFile $id '.ack.json'
        if (Test-Path -LiteralPath $ackPath) { continue }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "$($webUrl.TrimEnd('/'))/api/gateway/results" -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -Body ([IO.File]::ReadAllBytes($resultPath)) -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { Write-AtomicJson $ackPath @{ importedAt = (Get-Date).ToString('o') }; Cleanup $id }
        } catch { # Durable result remains pending until the web server acknowledges it.
        }
    }
    if (-not $busy -and $waiting.Count -gt 0) { Start-PendingJob $waiting[0] }
}
function Respond { param($Context, [int]$Status, $Body)
    $Context.Response.StatusCode = $Status
    if ($null -ne $Body) { $bytes = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress)); $Context.Response.ContentType = 'application/json'; $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
}
try {
    $listener.Start(); Write-Host "IT Lifecycle Gateway: $ListenPrefix"
    $nextSync = Get-Date; $pending = $listener.GetContextAsync()
    while ($listener.IsListening) {
        if ((Get-Date) -ge $nextSync) { Sync-Queue; $nextSync = (Get-Date).AddSeconds(5) }
        if (-not $pending.IsCompleted) { Start-Sleep -Milliseconds 100; continue }
        $context = $pending.GetAwaiter().GetResult(); $pending = $listener.GetContextAsync()
        $acceptance = $false
        $requestStage = 'routing'
        try {
            if ($context.Request.Url.AbsolutePath -eq '/health' -and $context.Request.HttpMethod -eq 'GET') { Respond $context 200 @{ status = 'ok' }; continue }
            if ($context.Request.Headers['Authorization'] -cne "Bearer $token") { Respond $context 401 @{ accepted = $false; noExecution = $true }; continue }
            if ($context.Request.HttpMethod -eq 'GET' -and $context.Request.Url.AbsolutePath -eq '/results') {
                $id = [string]$context.Request.QueryString['jobId']
                if ($id -notmatch '^[a-zA-Z0-9_-]{1,120}$') { Respond $context 400 $null; continue }
                $path = QueueFile $id '.result.json'
                if (Test-Path -LiteralPath $path) { Respond $context 200 (Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json) }
                elseif (Test-Path -LiteralPath (QueueFile $id '.state.json')) { Respond $context 202 @{ status = 'running'; log = @() } }
                else { Respond $context 404 $null }; continue
            }
            if ($context.Request.HttpMethod -eq 'POST' -and $context.Request.Url.AbsolutePath -eq '/jobs/reconcile') {
                # HTTP requests and queue mutation are serialized under the queue lock.
                # A tombstone closes the race with a delayed original submission.
                $acceptance = $null
                if ($context.Request.ContentLength64 -lt 1 -or $context.Request.ContentLength64 -gt 4096) { Respond $context 413 @{ noExecution = $false }; continue }
                $reader = [IO.StreamReader]::new($context.Request.InputStream, [Text.Encoding]::UTF8)
                try { $reconciliation = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
                $id = [string]$reconciliation.jobId
                if ($id -notmatch '^[a-zA-Z0-9_-]{1,120}$') { Respond $context 400 @{ error = 'Invalid job ID.'; noExecution = $false }; continue }
                $resultPath = QueueFile $id '.result.json'; $statePath = QueueFile $id '.state.json'; $jobPath = QueueFile $id '.json'
                if (Test-Path -LiteralPath $resultPath) {
                    Respond $context 200 @{ jobId = $id; status = 'completed'; noExecution = $false; result = (Get-Content $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json) }; continue
                }
                if (Test-Path -LiteralPath $statePath) {
                    $state = Get-Content $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
                    Respond $context 200 @{ jobId = $id; status = $(if ($state.status -eq 'accepted') { 'accepted' } else { 'running' }); noExecution = $false }; continue
                }
                if (Test-Path -LiteralPath $jobPath) { Respond $context 200 @{ jobId = $id; status = 'accepted'; noExecution = $false }; continue }
                $tombstonePath = QueueFile $id '.not-accepted.json'
                if (-not (Test-Path -LiteralPath $tombstonePath)) { Write-AtomicJson $tombstonePath @{ jobId = $id; status = 'not_accepted'; noExecution = $true; reconciledAt = (Get-Date).ToString('o') } }
                Respond $context 200 @{ jobId = $id; status = 'not_accepted'; noExecution = $true }; continue
            }
            if ($context.Request.HttpMethod -ne 'POST' -or $context.Request.Url.AbsolutePath -ne '/jobs') { Respond $context 404 $null; continue }
            if ($context.Request.ContentLength64 -lt 1 -or $context.Request.ContentLength64 -gt 1048576) { Respond $context 413 @{ accepted = $false; noExecution = $true }; continue }
            $requestStage = 'parse'
            $reader = [IO.StreamReader]::new($context.Request.InputStream, [Text.Encoding]::UTF8)
            try { $job = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
            $requestStage = 'contract'
            $id = [string]$job.jobId
            if ($id -notmatch '^[a-zA-Z0-9_-]{1,120}$' -or $job.runId -ne $id -or $job.schemaVersion -ne 1 -or $job.requestedMode -notin @('WhatIf', 'Execute') -or $job.directory.domain -ine $configuredDomain -or $job.operation -notin @('execute', 'reference_check', 'rollback') -or -not $job.person.employeeId) { throw 'Invalid job contract.' }
            if ($job.requestedMode -eq 'Execute' -and (-not $job.PSObject.Properties['executeApproved'] -or $job.executeApproved -ne $true)) { throw 'Execute requires explicit approval.' }
            if ($job.PSObject.Properties['callbackUrl'] -or $job.PSObject.Properties['callbackToken']) { throw 'Client-selected callbacks are forbidden.' }
            if ($job.operation -eq 'execute' -and (-not $job.PSObject.Properties['actions'] -or @($job.actions).Count -eq 0)) { throw 'Missing actions.' }
            if ($job.operation -eq 'reference_check' -and (-not $job.directory.PSObject.Properties['referenceUser'] -or $null -eq $job.directory.referenceUser -or -not $job.directory.referenceUser.query)) { throw 'Reference check requires a reference-user query.' }
            if ($job.operation -eq 'rollback' -and (-not $job.PSObject.Properties['originalRun'] -or $null -eq $job.originalRun -or -not $job.originalRun.id -or $job.originalRun.mode -ne 'Execute' -or -not $job.originalRun.PSObject.Properties['changes'] -or @($job.originalRun.changes).Count -eq 0)) { throw 'Rollback requires changes from an executed source run.' }
            $jobPath = QueueFile $id '.json'
            if (Test-Path -LiteralPath (QueueFile $id '.not-accepted.json')) { Respond $context 409 @{ jobId = $id; error = 'Job was conclusively not accepted during reconciliation and cannot be submitted later.'; accepted = $false; noExecution = $true }; continue }
            if (Test-Path -LiteralPath $jobPath) {
                $prior = Get-Content $jobPath -Raw -Encoding UTF8 | ConvertFrom-Json
                foreach ($secretName in @('adCredential', 'helpdeskCredential', 'initialPassword')) { $job.PSObject.Properties.Remove($secretName) }
                if (($prior | ConvertTo-Json -Depth 30 -Compress) -cne ($job | ConvertTo-Json -Depth 30 -Compress)) { Respond $context 409 @{ error = 'Job ID conflict.'; accepted = $null }; continue }
                Respond $context 202 @{ ok = $true; jobId = $id; duplicate = $true; accepted = $true }; continue
            }
            $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"' + (Join-Path $PSScriptRoot 'Invoke-ItLifecycleAgent.ps1') + '"'), '-JobPath', ('"' + $jobPath + '"'), '-Mode', $job.requestedMode)
            try {
                $requestStage = 'credential'
                foreach ($entry in @(@('adCredential', '.ad.credential.xml', '-CredentialPath'), @('helpdeskCredential', '.helpdesk.credential.xml', '-HelpdeskCredentialPath'), @('initialPassword', '.initial.credential.xml', '-InitialPasswordPath'))) {
                    if ($job.PSObject.Properties[$entry[0]]) {
                        $credentialPath = QueueFile $id $entry[1]
                        $spec = if ($entry[0] -eq 'initialPassword') { @{ username = $job.directory.samAccountName; password = $job.initialPassword } } else { $job.($entry[0]) }
                        Export-Credential $spec $credentialPath; $job.PSObject.Properties.Remove($entry[0]); $arguments += @($entry[2], ('"' + $credentialPath + '"'))
                    }
                }
                $acceptance = $null
                $requestStage = 'persistence'
                Write-AtomicJson $jobPath $job
                Write-AtomicJson (QueueFile $id '.state.json') @{ status = 'accepted'; pid = 0; startTicks = ''; createdAt = (Get-Date).ToString('o') }
                Respond $context 202 @{ ok = $true; jobId = $id; accepted = $true }
            } catch { if (-not (Test-Path -LiteralPath $jobPath)) { Cleanup $id; $acceptance = $false }; throw }
        } catch {
            if ($env:IT_LIFECYCLE_TEST_MODE -eq '1') { Write-Warning ('Gateway request failure: stage=' + $requestStage + '; type=' + $_.Exception.GetType().Name + '; line=' + $_.InvocationInfo.ScriptLineNumber) }
            try { Respond $context $(if ($acceptance -eq $false) { 400 } else { 503 }) @{ error = ('Gateway request failed at ' + $requestStage + '; inspect configuration.'); accepted = $acceptance; noExecution = ($acceptance -eq $false) } } catch [Net.HttpListenerException] { } catch [IO.IOException] { } catch [ObjectDisposedException] { }
        }
        finally { try { $context.Response.Close() } catch [Net.HttpListenerException] { } catch [IO.IOException] { } catch [ObjectDisposedException] { } }
    }
} finally { $listener.Stop(); $listener.Close(); $queueLock.Dispose(); $token = $null }
