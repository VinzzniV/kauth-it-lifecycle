[CmdletBinding()]
param([string]$Workspace = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run with Windows PowerShell 5.1.' }
# Fixture creation needs Security; importing it explicitly preserves the bad
# inherited module path for the agent children exercised by the Node regression.
Import-Module ([IO.Path]::Combine($PSHOME, 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')) -ErrorAction Stop
if (-not $Workspace) { $Workspace = Join-Path ([IO.Path]::GetTempPath()) ('it-lifecycle-ps-' + [guid]::NewGuid().ToString('N')) }
New-Item -ItemType Directory -Path $Workspace -Force | Out-Null
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$agent = Join-Path $root 'public\agent\Invoke-ItLifecycleAgent.ps1'
$adapter = Join-Path $PSScriptRoot 'TestAdapter.ps1'
$env:IT_LIFECYCLE_TEST_MODE='1'; $env:IT_LIFECYCLE_TEST_STATE=Join-Path $Workspace 'adapter.json'
$env:AD_DOMAIN='kauth.local'
foreach($name in @('M365_TENANT_ID','M365_CLIENT_ID','M365_CERT_THUMBPRINT','M365_ORGANIZATION')){[Environment]::SetEnvironmentVariable($name,'isolated-test','Process')}
$passed = [Collections.Generic.List[string]]::new()
function Assert { param([bool]$Condition,[string]$Message); if(-not $Condition){throw $Message} }
function Read-State { return Get-Content $env:IT_LIFECYCLE_TEST_STATE -Raw -Encoding UTF8|ConvertFrom-Json }
function Reset-State {
    @{mutations=0; users=@(); computers=@(); tickets=@(); groups=@(@{Name='staff';SamAccountName='staff';DistinguishedName='CN=staff,OU=Groups,DC=kauth,DC=local';ObjectGUID='11111111-1111-1111-1111-111111111111'}); cloudUser=@{Id='cloud-user';UserPrincipalName='test@kauth.local';UsageLocation='DE';AssignedLicenses=@()};sku=@{SkuId='sku-test';SkuPartNumber='SPB';PrepaidUnits=@{Enabled=2;Warning=0};ConsumedUnits=0}}|ConvertTo-Json -Depth 20|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
    $env:IT_LIFECYCLE_TEST_FAIL=''; $env:IT_LIFECYCLE_TEST_FORBID_AD=''
}
function Job { param([string[]]$Actions,[string]$Mode='Execute')
    $id='job-'+[guid]::NewGuid().ToString('N')
    return @{schemaVersion=1;jobId=$id;runId=$id;operation='execute';requestedMode=$Mode;executeApproved=$true;lifecycleType='onboarding';person=@{employeeId='employee-test';firstName='Test';lastName='Example';displayName='Example, Test';personnelNumber='T001';department='IT';company='Test'};directory=@{domain='kauth.local';samAccountName='test';userPrincipalName='test@kauth.local';mail='test@example.invalid';title='Engineer';description='Test';targetOu='OU=Test,DC=kauth,DC=local';disabledOu='OU=Disabled,DC=kauth,DC=local';referenceUser=$null;computers=@(@{type='Notebook';prefix='PK-CLNB';targetOu='OU=Computers,DC=kauth,DC=local';description='Test notebook';mode='new'})};microsoft365=@{syncServer='isolated';skuPartNumber='SPB';usageLocation='DE';userSyncTimeoutMinutes=0;mailboxTimeoutMinutes=0};helpdesk=@{baseUrl='http://example.invalid';subject='Test';text='Test'};automationTaskIds=@();actions=@($Actions|ForEach-Object{@{type=$_;target='Test'}})}
}
function Run-Job { param($Spec)
    $path=Join-Path $Workspace ($Spec.jobId+'.json'); $Spec|ConvertTo-Json -Depth 30|Set-Content $path -Encoding UTF8
    $cred=New-Object Management.Automation.PSCredential('test',(ConvertTo-SecureString 'test-secret' -AsPlainText -Force))
    $ad=$path+'.ad.xml';$help=$path+'.help.xml';$initial=$path+'.initial.xml'
    foreach($file in @($ad,$help,$initial)){$cred|Export-Clixml -LiteralPath $file}
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $agent -JobPath $path -CredentialPath $ad -HelpdeskCredentialPath $help -InitialPasswordPath $initial -TestAdapterPath $adapter | Out-Null
    foreach($file in @($ad,$help,$initial)){Assert (-not(Test-Path $file)) 'Credentials were not cleaned'}
    return Get-Content ([IO.Path]::ChangeExtension($path,'.result.json')) -Raw -Encoding UTF8|ConvertFrom-Json
}
Reset-State
$result=Run-Job (Job @('CreateAdUser','AddGroup:staff','CreateAdComputer:Notebook','ProvisionM365Mailbox','CreateHelpdeskTicket') 'WhatIf')
Assert ($result.status -eq 'completed' -and (Read-State).mutations -eq 0) 'WhatIf mutated adapter or failed';$passed.Add('WhatIf: all actions, zero external mutations')
Reset-State
$result=Run-Job (Job @('CreateAdUser','AddGroup:staff','CreateAdComputer:Notebook'))
Assert ($result.status -eq 'completed' -and @($result.actionResults).Count -eq 3) 'AD execute failed'
foreach($change in $result.changes){$guid=[guid]::Empty;Assert ([guid]::TryParse($change.resourceId,[ref]$guid)) 'Mutable AD rollback identity'}
$passed.Add('AD create/group/computer: immutable GUID changes')
$source=$result;$rollback=Job @();$rollback.operation='rollback';$rollback.Remove('actions');$rollback.originalRun=@{id=$source.runId;mode='Execute';changes=$source.changes}
$rollback.requestedMode='WhatIf';$before=(Read-State).mutations;$dry=Run-Job $rollback
Assert ($dry.status -eq 'completed' -and (Read-State).mutations -eq $before) 'Rollback WhatIf mutated or failed';$passed.Add('Rollback WhatIf: validated without mutation')
$rollback.jobId='job-'+[guid]::NewGuid().ToString('N');$rollback.runId=$rollback.jobId;$rollback.requestedMode='Execute';$reverted=Run-Job $rollback
Assert ($reverted.status -eq 'completed' -and @((Read-State).users).Count -eq 0 -and @((Read-State).computers).Count -eq 0) 'AD rollback failed'
Assert (@($reverted.changes|Where-Object{$_.sourceChangeId}).Count -eq 3) 'Rollback source binding missing';$passed.Add('Rollback Execute: users/groups/computer reverted')
Reset-State
$job=Job @('CreateAdUser');$job.executeApproved=$false;$result=Run-Job $job
Assert ($result.status -eq 'failed' -and (Read-State).mutations -eq 0) 'Execute approval bypass';$passed.Add('Explicit Execute approval enforced')
Reset-State
$job=Job @();$result=Run-Job $job;Assert ($result.status -eq 'failed') 'Missing actions not controlled';$passed.Add('Early validation failure plus DPAPI cleanup')
Reset-State
$created=Run-Job (Job @('CreateAdUser'));$state=Read-State;$state.users[0].Title='changed externally';$state|ConvertTo-Json -Depth 30|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
$rollback=Job @();$rollback.operation='rollback';$rollback.Remove('actions');$rollback.originalRun=@{id=$created.runId;mode='Execute';changes=$created.changes};$result=Run-Job $rollback
Assert ($result.status -eq 'review_required' -and $result.actionResults[0].status -eq 'review_required' -and @((Read-State).users).Count -eq 1) 'Rollback conflict deleted changed user';$passed.Add('Rollback conflict blocks deletion')
Reset-State
$env:IT_LIFECYCLE_TEST_FORBID_AD='1';$state=Read-State;$state.sku.ConsumedUnits=2;$state|ConvertTo-Json -Depth 30|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
$result=Run-Job (Job @('ProvisionM365Mailbox'));Assert ($result.actionResults[0].status -eq 'failed') 'License shortage not retryable'
$state=Read-State;$state.sku.ConsumedUnits=0;$state|ConvertTo-Json -Depth 30|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
$result=Run-Job (Job @('ProvisionM365Mailbox'));Assert ($result.status -eq 'completed') 'M365 only retry failed or used AD';$passed.Add('M365 license shortage plus isolated retry without AD')
Reset-State;$env:IT_LIFECYCLE_TEST_FAIL='HelpdeskTimeout'
$result=Run-Job (Job @('CreateHelpdeskTicket'));Assert ($result.actionResults[0].status -eq 'review_required') 'Lost ticket response should require review';$passed.Add('Ticket response loss records review_required')
Reset-State
$reference=Job @() 'WhatIf';$reference.operation='reference_check';$reference.Remove('actions');$reference.directory.referenceUser=@{query='absent';displayName='absent'};$result=Run-Job $reference
Assert ($result.status -eq 'completed' -and $result.referenceLookup.status -eq 'not_found') 'Reference job contract failed';$passed.Add('Reference check without actions')
Reset-State
$created=Run-Job (Job @('CreateAdUser','AddGroup:staff'))
$changeJob=Job @('UpdateAdUser');$changeJob.lifecycleType='change';$changeJob.directory.title='Team Lead';$changeJob.directory.targetOu='OU=Changed,DC=kauth,DC=local';$updated=Run-Job $changeJob
Assert ($updated.status -eq 'completed' -and @($updated.changes).Count -eq 2) 'Lifecycle attribute/OU change failed'
$rollback=Job @();$rollback.operation='rollback';$rollback.Remove('actions');$rollback.originalRun=@{id=$updated.runId;mode='Execute';changes=$updated.changes};$result=Run-Job $rollback
Assert ($result.status -eq 'completed' -and (Read-State).users[0].Title -eq 'Engineer') 'Lifecycle attributes did not restore';$passed.Add('Lifecycle change attributes and OU plus checked rollback')
$offboard=Job @('SnapshotAdAccount','DisableAdUser','RemoveGroupMemberships','MoveAdUser');$offboard.lifecycleType='offboarding';$removed=Run-Job $offboard
Assert ($removed.status -eq 'completed' -and -not (Read-State).users[0].Enabled) 'Offboarding failed'
$rollback=Job @();$rollback.operation='rollback';$rollback.Remove('actions');$rollback.originalRun=@{id=$removed.runId;mode='Execute';changes=$removed.changes};$result=Run-Job $rollback
Assert ($result.status -eq 'completed' -and (Read-State).users[0].Enabled -and @((Read-State).users[0].MemberOf).Count -eq 1) 'Offboarding did not restore';$passed.Add('AD offboarding state/group/OU and supported rollback')
Reset-State
$state=Read-State;$state.sku.ConsumedUnits=2;$state|ConvertTo-Json -Depth 30|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
$result=Run-Job (Job @('CreateAdUser','ProvisionM365Mailbox'))
Assert ($result.status -eq 'partial' -and $result.actionResults[0].status -eq 'completed' -and $result.actionResults[1].status -eq 'failed') 'Partial result lost successful action';$passed.Add('Partial failure preserves per-action success')
$invalid=Join-Path $Workspace 'corrupt.json';'{"password":"isolated-sensitive-marker"'|Set-Content $invalid -Encoding UTF8
$credential=Join-Path $Workspace 'corrupt.credential.xml';(New-Object Management.Automation.PSCredential('test',(ConvertTo-SecureString 'test-secret' -AsPlainText -Force)))|Export-Clixml -LiteralPath $credential
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $agent -JobPath $invalid -CredentialPath $credential|Out-Null
Assert (-not(Test-Path $credential)) 'Corrupt JSON leaked credential'
Assert ((Get-Content ([IO.Path]::ChangeExtension($invalid,'.result.json')) -Raw|ConvertFrom-Json).status -eq 'failed') 'Corrupt JSON lacks controlled result';$passed.Add('Corrupt JSON controlled failure with DPAPI cleanup')
Assert ((Get-Content ([IO.Path]::ChangeExtension($invalid,'.result.json')) -Raw)-notmatch 'isolated-sensitive-marker') 'JSON parse failure exposed credential-like payload'
foreach ($invalidJson in @('null','[]','42','{"schemaVersion":1,"person":null}','{"schemaVersion":1,"requestedMode":"Execute","operation":"rollback","executeApproved":true,"directory":{"domain":"kauth.local"},"originalRun":null}')) {
    $invalidPath=Join-Path $Workspace ('invalid-envelope-'+[guid]::NewGuid().ToString('N')+'.json')
    $invalidJson|Set-Content $invalidPath -Encoding UTF8
    $credentialPaths=@(($invalidPath+'.ad.xml'),($invalidPath+'.help.xml'),($invalidPath+'.initial.xml'))
    foreach($credentialPath in $credentialPaths){(New-Object Management.Automation.PSCredential('test',(ConvertTo-SecureString 'test-secret' -AsPlainText -Force)))|Export-Clixml $credentialPath}
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $agent -JobPath $invalidPath -CredentialPath $credentialPaths[0] -HelpdeskCredentialPath $credentialPaths[1] -InitialPasswordPath $credentialPaths[2]|Out-Null
    Assert ((Get-Content ([IO.Path]::ChangeExtension($invalidPath,'.result.json')) -Raw|ConvertFrom-Json).status-eq'failed') 'Invalid JSON envelope has no controlled failure result'
    foreach($credentialPath in $credentialPaths){Assert (-not(Test-Path $credentialPath)) 'Invalid envelope leaked DPAPI credential'}
    Assert (-not(Test-Path ([IO.Path]::ChangeExtension($invalidPath,'.progress.json')))) 'Invalid envelope left running progress behind'
}
$passed.Add('Null/scalar/array envelopes and null result metadata produce failure plus credential cleanup')
Reset-State
$env:AD_DOMAIN='isolated.local';$configured=Job @('ProvisionM365Mailbox') 'WhatIf';$configured.directory.domain='isolated.local';$result=Run-Job $configured
Assert ($result.status-eq'completed'-and (Read-State).mutations-eq0) 'Configured directory domain was rejected'
$configured.jobId='job-'+[guid]::NewGuid().ToString('N');$configured.runId=$configured.jobId;$configured.directory.domain='untrusted.local';$result=Run-Job $configured
Assert ($result.status-eq'failed'-and (Read-State).mutations-eq0) 'Untrusted directory domain was allowed';$env:AD_DOMAIN='kauth.local'
$passed.Add('AD domain follows trusted local configuration and rejects a mismatched job')
Reset-State
$created=Run-Job (Job @('CreateAdUser'));$state=Read-State;$identity=$state.users[0].ObjectGUID
$renamed=Job @('UpdateAdUser');$renamed.person.lastName='Schmidt';$renamed.directory.samAccountName='schmidt';$renamed.directory.objectGuid=$identity;$result=Run-Job $renamed
Assert ($result.status -eq 'completed' -and (Read-State).users[0].ObjectGUID -eq $identity -and (Read-State).users[0].DisplayName -eq 'Schmidt, Test' -and $result.directoryIdentity.objectGuid -eq $identity -and $result.directoryIdentity.samAccountName -eq 'test') 'HR rename lost bound account';$passed.Add('HR surname change targets same personnel-bound GUID')
$wrong=Job @('DisableAdUser');$wrong.person.personnelNumber='OTHER';$wrong.directory.samAccountName='test';$result=Run-Job $wrong
Assert ($result.status -eq 'failed' -and (Read-State).users[0].Enabled) 'Same-name different person account changed';$passed.Add('Same-name different personnel number is rejected')
Reset-State
$created=Run-Job (Job @('CreateAdUser'));$state=Read-State
$secondDn='CN=second,OU=Groups,DC=kauth,DC=local'
$state.users=@($state.users)+@([pscustomobject]@{Name='reference';SamAccountName='reference';UserPrincipalName='reference@kauth.local';EmployeeNumber='REF';ObjectGUID='22222222-2222-2222-2222-222222222222';DisplayName='Reference';DistinguishedName='CN=reference,OU=Test,DC=kauth,DC=local';MemberOf=@($state.groups[0].DistinguishedName,$secondDn)})
$state|ConvertTo-Json -Depth 30|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
$copy=Job @('CopyGroupsFromReference');$copy.directory.referenceUser=@{query='reference';displayName='Reference'};$result=Run-Job $copy
Assert ($result.actionResults[0].status -eq 'failed' -and @($result.changes).Count -eq 1) 'Known first group plus later read failure became uncertain'
$state=Read-State;$state.groups=@($state.groups)+@([pscustomobject]@{Name='second';SamAccountName='second';DistinguishedName=$secondDn;ObjectGUID='33333333-3333-3333-3333-333333333333'});$state|ConvertTo-Json -Depth 30|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
$copy.jobId='job-'+[guid]::NewGuid().ToString('N');$copy.runId=$copy.jobId;$result=Run-Job $copy
Assert ($result.status -eq 'completed' -and @($result.changes).Count -eq 1 -and @((Read-State).users[0].MemberOf).Count -eq 2) 'Reference-group retry duplicated prior membership';$passed.Add('Partial group-copy retry skips known successful membership')
Reset-State
$longLocation=Job @('CreateAdUser','CreateAdComputer:Notebook');$longLocation.directory.computers[0].prefix='ABCDE-CLNB';$result=Run-Job $longLocation
Assert ($result.status-eq'completed'-and (Read-State).computers[0].Name-eq'ABCDE-CLNB001') 'Five-letter location code could not create a computer'
$state=Read-State;$state.computers[0].Name='ABCDE-CLNB99999';$state.computers[0].SamAccountName='ABCDE-CLNB99999$';$state|ConvertTo-Json -Depth 30|Set-Content $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8
$before=$state.mutations;$overflow=Job @('CreateAdComputer:Notebook');$overflow.directory.computers[0].prefix='ABCDE-CLNB';$result=Run-Job $overflow
Assert ($result.status-eq'failed'-and $result.actionResults[0].error-match '15 characters'-and (Read-State).mutations-eq$before-and @((Read-State).computers).Count-eq1) 'Oversized generated computer name was not blocked before mutation'
$passed.Add('Five-letter location code supported; 15-character computer limit enforced before creation')
@{powershell=$PSVersionTable.PSVersion.ToString();passed=$passed;workspace=$Workspace}|ConvertTo-Json -Depth 8
