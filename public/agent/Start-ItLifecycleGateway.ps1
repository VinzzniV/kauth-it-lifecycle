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
            $credentialPath = ''
            if ($job.PSObject.Properties['adCredential']) {
                $username = ([string]$job.adCredential.username).Trim()
                $plainPassword = [string]$job.adCredential.password
                if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($plainPassword) -or $username.Length -gt 200 -or $plainPassword.Length -gt 512) {
                    $plainPassword = $null
                    $username = $null
                    $context.Response.StatusCode = 400
                    continue
                }
                $credentialPath = Join-Path $QueuePath "$safeJobId.credential.xml"
                $securePassword = ConvertTo-SecureString -String $plainPassword -AsPlainText -Force
                $credential = [Management.Automation.PSCredential]::new($username, $securePassword)
                $credential | Export-Clixml -LiteralPath $credentialPath -Force
                $job.PSObject.Properties.Remove('adCredential')
                $plainPassword = $null
                $username = $null
                $securePassword = $null
                $credential = $null
            }
            $raw = $null
            $job | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $jobPath -Encoding UTF8
            $agentArguments = @('-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', $agentPath, '-JobPath', $jobPath, '-Mode', $job.requestedMode)
            if ($credentialPath) { $agentArguments += @('-CredentialPath', $credentialPath) }
            try {
                Start-Process -FilePath 'powershell.exe' -ArgumentList $agentArguments -WindowStyle Hidden
            } catch {
                if ($credentialPath) { Remove-Item -LiteralPath $credentialPath -Force -ErrorAction SilentlyContinue }
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
