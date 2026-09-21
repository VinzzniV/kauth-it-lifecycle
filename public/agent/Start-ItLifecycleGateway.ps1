[CmdletBinding()]
param(
    [string]$ListenPrefix = 'http://localhost:8788/',
    [string]$QueuePath = "$env:ProgramData\Kauth\ITLifecycle\Queue"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$agentPath = Join-Path $PSScriptRoot 'Invoke-ItLifecycleAgent.ps1'
if (-not (Test-Path -LiteralPath $agentPath)) { throw "Agent not found: $agentPath" }
New-Item -ItemType Directory -Path $QueuePath -Force | Out-Null
$runningJobs = @{}

function Export-TransientCredential {
    param($CredentialSpec, [string]$Path)
    $username = ([string]$CredentialSpec.username).Trim()
    $plainPassword = [string]$CredentialSpec.password
    $securePassword = $null
    $credential = $null
    if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($plainPassword) -or $username.Length -gt 200 -or $plainPassword.Length -gt 512) {
        throw 'Invalid transient credential.'
    }
    try {
        $securePassword = ConvertTo-SecureString -String $plainPassword -AsPlainText -Force
        $credential = [Management.Automation.PSCredential]::new($username, $securePassword)
        $credential | Export-Clixml -LiteralPath $Path -Force
    } finally {
        $plainPassword = $null
        $username = $null
        $securePassword = $null
        $credential = $null
    }
}

function Write-FailedResult {
    param([string]$SafeJobId, [string]$Message)
    $jobPath = Join-Path $QueuePath "$SafeJobId.json"
    $resultPath = Join-Path $QueuePath "$SafeJobId.result.json"
    if (-not (Test-Path -LiteralPath $jobPath)) { return }
    $failedJob = Get-Content -LiteralPath $jobPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $now = (Get-Date).ToString('o')
    $failedResult = [pscustomobject]@{
        schemaVersion = 1
        runId = if ($failedJob.PSObject.Properties['runId']) { [string]$failedJob.runId } else { [string]$failedJob.jobId }
        jobId = [string]$failedJob.jobId
        employeeId = [string]$failedJob.person.employeeId
        operation = [string]$failedJob.operation
        mode = [string]$failedJob.requestedMode
        status = 'failed'
        relatedRunId = $null
        startedAt = $now
        completedAt = $now
        error = $Message
        automationTaskIds = @()
        changes = @()
        log = @([pscustomobject]@{ time = $now; action = 'Agent process'; state = 'failed'; message = $Message })
        referenceLookup = $null
        computerName = $env:COMPUTERNAME
        operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    }
    $failedResult | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultPath -Encoding UTF8
}

$secureToken = Read-Host 'Gateway token (same value as MANAGEMENT_AGENT_TOKEN in Sites)' -AsSecureString
$token = [Net.NetworkCredential]::new('', $secureToken).Password
if ([string]::IsNullOrWhiteSpace($token)) { throw 'A gateway token is required.' }

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add($ListenPrefix)
$listener.Start()
Write-Host "IT Lifecycle Gateway listening on $ListenPrefix" -ForegroundColor Cyan
Write-Host 'Keep this window open. WhatIf, Execute and rollback jobs are accepted.' -ForegroundColor DarkGray

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            if ($context.Request.HttpMethod -eq 'GET' -and $context.Request.Url.AbsolutePath -eq '/health') {
                $payload = @{ status = 'ok'; queuePath = $QueuePath } | ConvertTo-Json -Compress
                $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
                $context.Response.StatusCode = 200
                $context.Response.ContentType = 'application/json'
                $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                continue
            }
            if ($context.Request.HttpMethod -eq 'GET' -and $context.Request.Url.AbsolutePath -eq '/results') {
                if ($context.Request.Headers['Authorization'] -ne "Bearer $token") { $context.Response.StatusCode = 401; continue }
                $safeResultId = ([string]$context.Request.QueryString['jobId']) -replace '[^a-zA-Z0-9._-]', '_'
                if ([string]::IsNullOrWhiteSpace($safeResultId)) { $context.Response.StatusCode = 400; continue }
                $resultPath = Join-Path $QueuePath "$safeResultId.result.json"
                if (-not (Test-Path -LiteralPath $resultPath)) {
                    if ($runningJobs.ContainsKey($safeResultId)) {
                        $process = $runningJobs[$safeResultId]
                        if (-not $process.HasExited) {
                            $progressPath = Join-Path $QueuePath "$safeResultId.progress.json"
                            if (Test-Path -LiteralPath $progressPath) {
                                try {
                                    $payload = Get-Content -LiteralPath $progressPath -Raw -Encoding UTF8
                                    $null = $payload | ConvertFrom-Json
                                } catch {
                                    $payload = @{ status = 'running'; startedAt = $process.StartTime.ToString('o'); currentAction = 'Status wird aktualisiert'; log = @() } | ConvertTo-Json -Depth 8 -Compress
                                }
                            } else {
                                $payload = @{ status = 'running'; startedAt = $process.StartTime.ToString('o'); currentAction = 'Agent wird gestartet'; log = @() } | ConvertTo-Json -Depth 8 -Compress
                            }
                            $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
                            $context.Response.StatusCode = 202
                            $context.Response.ContentType = 'application/json'
                            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                            continue
                        }
                        Write-FailedResult $safeResultId "Agent process ended without a result file (exit code $($process.ExitCode))."
                        $runningJobs.Remove($safeResultId)
                    } elseif (Test-Path -LiteralPath (Join-Path $QueuePath "$safeResultId.json")) {
                        Write-FailedResult $safeResultId 'Gateway was restarted before the agent returned a result. Check the affected systems before retrying.'
                    } else {
                        $context.Response.StatusCode = 404
                        continue
                    }
                }
                if ($runningJobs.ContainsKey($safeResultId)) { $runningJobs.Remove($safeResultId) }
                $resultBytes = [IO.File]::ReadAllBytes($resultPath)
                $context.Response.StatusCode = 200
                $context.Response.ContentType = 'application/json'
                $context.Response.OutputStream.Write($resultBytes, 0, $resultBytes.Length)
                continue
            }
            if ($context.Request.HttpMethod -ne 'POST' -or $context.Request.Url.AbsolutePath -ne '/jobs') {
                $context.Response.StatusCode = 404
                continue
            }
            if ($context.Request.Headers['Authorization'] -ne "Bearer $token") {
                $context.Response.StatusCode = 401
                continue
            }
            if ($context.Request.ContentLength64 -lt 1 -or $context.Request.ContentLength64 -gt 1048576) {
                $context.Response.StatusCode = 413
                continue
            }
            $reader = [IO.StreamReader]::new($context.Request.InputStream, $context.Request.ContentEncoding)
            $raw = $reader.ReadToEnd()
            $job = $raw | ConvertFrom-Json
            if ($job.schemaVersion -ne 1 -or $job.requestedMode -notin @('WhatIf', 'Execute') -or $job.directory.domain -ne 'kauth.local' -or $job.operation -notin @('execute', 'rollback', 'reference_check')) {
                $context.Response.StatusCode = 400
                continue
            }
            $safeJobId = ([string]$job.jobId) -replace '[^a-zA-Z0-9._-]', '_'
            $jobPath = Join-Path $QueuePath "$safeJobId.json"
            $resultPath = Join-Path $QueuePath "$safeJobId.result.json"
            if (Test-Path -LiteralPath $resultPath) {
                $payload = @{ error = "Auftrag '$safeJobId' wurde bereits ausgefuehrt und wird nicht erneut gestartet." } | ConvertTo-Json -Compress
                $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
                $context.Response.StatusCode = 409
                $context.Response.ContentType = 'application/json'
                $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                continue
            }
            if ((Test-Path -LiteralPath $jobPath) -and -not (Test-Path -LiteralPath $resultPath)) {
                $context.Response.StatusCode = 202
                continue
            }
            $credentialPath = ''
            $helpdeskCredentialPath = ''
            $initialPasswordPath = ''
            try {
                if ($job.PSObject.Properties['adCredential']) {
                    $credentialPath = Join-Path $QueuePath "$safeJobId.ad.credential.xml"
                    Export-TransientCredential $job.adCredential $credentialPath
                    $job.PSObject.Properties.Remove('adCredential')
                }
                if ($job.PSObject.Properties['helpdeskCredential']) {
                    $helpdeskCredentialPath = Join-Path $QueuePath "$safeJobId.helpdesk.credential.xml"
                    Export-TransientCredential $job.helpdeskCredential $helpdeskCredentialPath
                    $job.PSObject.Properties.Remove('helpdeskCredential')
                }
                if ($job.PSObject.Properties['initialPassword']) {
                    $initialPasswordPath = Join-Path $QueuePath "$safeJobId.initial-password.credential.xml"
                    $initialPasswordSpec = [pscustomobject]@{
                        username = [string]$job.directory.samAccountName
                        password = [string]$job.initialPassword
                    }
                    Export-TransientCredential $initialPasswordSpec $initialPasswordPath
                    $job.PSObject.Properties.Remove('initialPassword')
                    $initialPasswordSpec = $null
                }
                $raw = $null
                $job | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $jobPath -Encoding UTF8
            } catch {
                if ($credentialPath) { Remove-Item -LiteralPath $credentialPath -Force -ErrorAction SilentlyContinue }
                if ($helpdeskCredentialPath) { Remove-Item -LiteralPath $helpdeskCredentialPath -Force -ErrorAction SilentlyContinue }
                if ($initialPasswordPath) { Remove-Item -LiteralPath $initialPasswordPath -Force -ErrorAction SilentlyContinue }
                throw
            }
            $agentArguments = @('-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', $agentPath, '-JobPath', $jobPath, '-Mode', $job.requestedMode)
            if ($credentialPath) { $agentArguments += @('-CredentialPath', $credentialPath) }
            if ($helpdeskCredentialPath) { $agentArguments += @('-HelpdeskCredentialPath', $helpdeskCredentialPath) }
            if ($initialPasswordPath) { $agentArguments += @('-InitialPasswordPath', $initialPasswordPath) }
            try {
                $agentProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $agentArguments -WindowStyle Hidden -PassThru
                $runningJobs[$safeJobId] = $agentProcess
            } catch {
                if ($credentialPath) { Remove-Item -LiteralPath $credentialPath -Force -ErrorAction SilentlyContinue }
                if ($helpdeskCredentialPath) { Remove-Item -LiteralPath $helpdeskCredentialPath -Force -ErrorAction SilentlyContinue }
                if ($initialPasswordPath) { Remove-Item -LiteralPath $initialPasswordPath -Force -ErrorAction SilentlyContinue }
                throw
            }
            $payload = @{ ok = $true; jobId = $job.jobId } | ConvertTo-Json -Compress
            $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
            $context.Response.StatusCode = 202
            $context.Response.ContentType = 'application/json'
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $context.Response.StatusCode = 500
        } finally {
            $context.Response.Close()
        }
    }
} finally {
    $token = $null
    $listener.Stop()
    $listener.Close()
}
