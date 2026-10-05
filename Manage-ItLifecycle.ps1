[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Setup','Check','Start','Status','Stop','Update','Backup','Restore')][string]$Command,
    [string]$ConfigurationPath='',
    [string]$Identity='',
    [string]$HttpsThumbprint='',
    [string[]]$GatewayRemoteAddress=@(),
    [string[]]$WebRemoteAddress=@(),
    [string]$TaskName='Kauth-ITLifecycle-Gateway',
    [switch]$ApplySetup,
    [Management.Automation.PSCredential]$TaskCredential,
    [string]$Revision='',
    [string]$Image='',
    [string]$Volume='',
    [string]$BackupDirectory=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if(-not $ConfigurationPath){$ConfigurationPath=Join-Path $PSScriptRoot '.env'}
. (Join-Path $PSScriptRoot 'public\agent\Import-ItLifecycleEnv.ps1')
$settings=Import-ItLifecycleEnv $ConfigurationPath
$env:IT_LIFECYCLE_TEST_MODE=if($settings.ContainsKey('IT_LIFECYCLE_TEST_MODE')){[string]$settings['IT_LIFECYCLE_TEST_MODE']}else{'0'}
$queue=if($env:MANAGEMENT_AGENT_QUEUE_PATH){$env:MANAGEMENT_AGENT_QUEUE_PATH}else{"$env:ProgramData\Kauth\ITLifecycle\Queue"}
$gateway=Join-Path $PSScriptRoot 'public\agent\Start-ItLifecycleGateway.ps1'
$prefix=if($env:MANAGEMENT_AGENT_LISTEN_PREFIX){$env:MANAGEMENT_AGENT_LISTEN_PREFIX}else{'https://+:8788/'}
function Run-Docker {param([string[]]$Arguments); & docker @Arguments; if($LASTEXITCODE-ne0){throw 'Docker operation failed.'}}
function Compose-Arguments { param([string[]]$Arguments)
    $argsList=@('compose','--env-file',$ConfigurationPath)
    if($settings.ContainsKey('WEB_TLS_HOST')-and $settings['WEB_TLS_HOST']){$argsList+=@('--profile','https')}
    return $argsList+$Arguments
}
function Restrict-Path {param([string]$Path,[string]$Account,[bool]$Directory)
    $acl=if($Directory){New-Object Security.AccessControl.DirectorySecurity}else{New-Object Security.AccessControl.FileSecurity}
    $acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @('S-1-5-18','S-1-5-32-544')){
        $principal=New-Object Security.Principal.SecurityIdentifier($sid)
        $rule=if($Directory){New-Object Security.AccessControl.FileSystemAccessRule($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}else{New-Object Security.AccessControl.FileSystemAccessRule($principal,'FullControl','Allow')}
        $acl.AddAccessRule($rule)
    }
    $rights=if($Directory){'Modify'}else{'Read'}
    $rule=if($Directory){New-Object Security.AccessControl.FileSystemAccessRule($Account,$rights,'ContainerInherit,ObjectInherit','None','Allow')}else{New-Object Security.AccessControl.FileSystemAccessRule($Account,$rights,'Allow')}
    $acl.AddAccessRule($rule);Set-Acl -LiteralPath $Path -AclObject $acl
}
Push-Location $PSScriptRoot
try{
    switch($Command){
        'Check'{
            foreach($name in @('APP_USERNAME','APP_PASSWORD','MANAGEMENT_AGENT_URL','MANAGEMENT_AGENT_TOKEN','IT_LIFECYCLE_WEB_URL')){if(-not $settings.ContainsKey($name)-or -not $settings[$name]){throw "Missing configuration: $name"}}
            foreach($name in @('MANAGEMENT_AGENT_URL','IT_LIFECYCLE_WEB_URL')){if(([uri]$settings[$name]).Scheme-ne'https'-and $env:IT_LIFECYCLE_TEST_MODE-ne'1'){throw "HTTPS required: $name"}}
            if(-not(Get-Command docker -ErrorAction SilentlyContinue)){throw 'Docker unavailable.'};Run-Docker (Compose-Arguments @('config','--quiet'))
            if($settings.ContainsKey('WEB_TLS_HOST')-and $settings['WEB_TLS_HOST']){
                if(-not$env:WEB_TLS_CERT_DIRECTORY){throw 'WEB_TLS_CERT_DIRECTORY required for HTTPS profile.'}
                foreach($file in @('web.crt','web.key')){if(-not(Test-Path -LiteralPath (Join-Path $env:WEB_TLS_CERT_DIRECTORY $file))){throw "Missing HTTPS file: $file"}}
            }
            $tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseFile($gateway,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'Gateway parser errors.'}
            Write-Host 'Configuration structure and gateway parser passed. No external changes were performed.'
        }
        'Setup'{
            if(-not $Identity-or $Identity-match '(?i)domain admins|administrator$'){throw 'Provide a dedicated delegated gateway identity.'}
            if($HttpsThumbprint-notmatch '^[A-Fa-f0-9]{40}$'-or $GatewayRemoteAddress.Count-eq0){throw 'HTTPS certificate thumbprint and explicit gateway source addresses required.'}
            $uri=[uri]($prefix.Replace('+','localhost').Replace('*','localhost'));if($uri.Scheme-ne'https'){throw 'HTTPS listener required.'}
            $webPort=if($env:WEB_TLS_PORT){[int]$env:WEB_TLS_PORT}else{443}
            $plan=@{identity=$Identity;configuration=$ConfigurationPath;queue=$queue;task=$TaskName;gatewayPort=$uri.Port;remoteAddresses=$GatewayRemoteAddress;webPort=$webPort;webRemoteAddresses=$WebRemoteAddress;httpsCertificate=$HttpsThumbprint;apply=$ApplySetup.IsPresent}
            $plan|ConvertTo-Json -Depth 5
            if(-not $ApplySetup){Write-Host 'Prepared only. Review dedicated identity, certificate access, ACLs and firewall sources before -ApplySetup.';break}
            if(-not $Identity.EndsWith('$')-and (-not $TaskCredential-or $TaskCredential.UserName-ne$Identity)){throw 'Supply TaskCredential for the named identity before setup.'}
            $certificate=Get-Item -LiteralPath "Cert:\LocalMachine\My\$HttpsThumbprint"
            if(-not $certificate.HasPrivateKey){throw 'HTTPS certificate lacks private key.'}
            New-Item -ItemType Directory -Path $queue -Force|Out-Null
            Restrict-Path $ConfigurationPath $Identity $false;Restrict-Path $queue $Identity $true
            # Only additive, scoped rules. Existing RDP/WinRM access and firewall profiles remain intact.
            & netsh http add urlacl "url=$prefix" "user=$Identity";if($LASTEXITCODE-ne0){throw 'URL reservation failed; inspect existing reservation.'}
            & netsh http add sslcert "ipport=0.0.0.0:$($uri.Port)" "certhash=$HttpsThumbprint" 'appid={bf52102a-0085-4397-a978-a351b2f32156}' 'certstorename=MY';if($LASTEXITCODE-ne0){throw 'HTTPS binding failed; inspect existing binding.'}
            New-NetFirewallRule -Name 'Kauth-ITLifecycle-Gateway' -DisplayName 'Kauth IT Lifecycle Gateway (approved sources)' -Direction Inbound -Protocol TCP -LocalPort $uri.Port -RemoteAddress $GatewayRemoteAddress -Action Allow -Profile Domain|Out-Null
            if($WebRemoteAddress.Count){New-NetFirewallRule -Name 'Kauth-ITLifecycle-Web' -DisplayName 'Kauth IT Lifecycle HTTPS (approved sources)' -Direction Inbound -Protocol TCP -LocalPort $webPort -RemoteAddress $WebRemoteAddress -Action Allow -Profile Domain|Out-Null}
            $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File `"$gateway`" -ConfigurationPath `"$ConfigurationPath`"" -WorkingDirectory $PSScriptRoot
            $trigger=New-ScheduledTaskTrigger -AtStartup
            $taskSettings=New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
            if($Identity.EndsWith('$')){
                $principal=New-ScheduledTaskPrincipal -UserId $Identity -LogonType ServiceAccount -RunLevel Limited
                Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $taskSettings -Principal $principal|Out-Null
            }else{
                if(-not $TaskCredential-or $TaskCredential.UserName-ne$Identity){throw 'Supply TaskCredential for the named identity.'}
                Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $taskSettings -User $Identity -Password $TaskCredential.GetNetworkCredential().Password -RunLevel Limited|Out-Null
            }
            Write-Host 'Setup applied. Confirm certificate access under the scheduled identity and then start explicitly.'
        }
        'Start'{Run-Docker (Compose-Arguments @('up','-d'));Start-ScheduledTask -TaskName $TaskName}
        'Stop'{Stop-ScheduledTask -TaskName $TaskName;Run-Docker (Compose-Arguments @('stop'))}
        'Status'{
            git rev-parse HEAD;Run-Docker (Compose-Arguments @('ps'));Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue|Select-Object TaskName,State
            $waiting=@(Get-ChildItem $queue -Filter '*.result.json' -ErrorAction SilentlyContinue|Where-Object{-not(Test-Path ($_.FullName-replace '\.result\.json$','.ack.json'))}).Count
            Write-Host "Pending result imports: $waiting"
        }
        'Update'{& (Join-Path $PSScriptRoot 'Update-Server.ps1') -Revision $Revision -Image $Image -Volume $Volume -BackupDirectory $BackupDirectory -TaskName $TaskName -ConfigurationPath $ConfigurationPath}
        'Backup'{
            if(-not $Image-or -not $Volume-or -not $BackupDirectory){throw 'Image, explicit source Volume and BackupDirectory required.'}
            New-Item -ItemType Directory -Path $BackupDirectory -Force|Out-Null
            $backupPath=(Resolve-Path $BackupDirectory).Path
            # SQLite opens source databases read-only; WAL lock sidecars need directory write access.
            Run-Docker @('run','--rm','--network','none','-v',"${Volume}:/data",'-v',"${backupPath}:/backup",$Image,'node','scripts/backup.mjs','backup','/data','/backup')
        }
        'Restore'{
            if(-not $Image-or -not $Volume-or -not $BackupDirectory-or $Volume-notmatch '^[a-zA-Z0-9_-]+$'){throw 'Image, new explicit Volume and BackupDirectory required.'}
            $existingVolumes=@(& docker volume ls --format '{{.Name}}')
            if($LASTEXITCODE-ne0){throw 'Cannot verify existing volumes before restore.'}
            if($existingVolumes-contains$Volume){throw 'Restore requires a NEW volume; existing volumes are never overwritten.'}
            $backupPath=(Resolve-Path $BackupDirectory).Path;Run-Docker @('volume','create',$Volume)
            Run-Docker @('run','--rm','--network','none','-v',"${Volume}:/data",'-v',"${backupPath}:/backup:ro",$Image,'node','scripts/backup.mjs','restore','/data','/backup')
        }
    }
}finally{Pop-Location}
