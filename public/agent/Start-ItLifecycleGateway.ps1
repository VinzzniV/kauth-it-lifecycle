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
                if (-not (Test-Path -LiteralPath $resultPath)) { $context.Response.StatusCode = 202; continue }
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
            if ((Test-Path -LiteralPath $jobPath) -and -not (Test-Path -LiteralPath $resultPath)) {
                $context.Response.StatusCode = 202
                continue
            }
            $raw | Set-Content -LiteralPath $jobPath -Encoding UTF8
            Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', $agentPath, '-JobPath', $jobPath, '-Mode', $job.requestedMode)
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
