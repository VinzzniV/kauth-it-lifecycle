[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$JobPath,
    [string]$CredentialPath = '',
    [string]$HelpdeskCredentialPath = '',
    [string]$InitialPasswordPath = '',
    [ValidateSet('Job', 'WhatIf', 'Execute')]
    [string]$Mode = 'Job',
    [string]$TestAdapterPath = ''
)

# Resolve native 5.1 cmdlets even when a Node/PowerShell 7 parent supplies its module path.
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules') + [IO.Path]::PathSeparator + $env:PSModulePath
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
trap {
    foreach ($path in @($CredentialPath, $HelpdeskCredentialPath, $InitialPasswordPath)) { if ($path) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue } }
    throw $_
}
$resolvedJobPath = [IO.Path]::GetFullPath($JobPath)
$progressPath = [IO.Path]::ChangeExtension($resolvedJobPath, '.progress.json')
$job = [pscustomobject]@{ jobId = [IO.Path]::GetFileNameWithoutExtension($resolvedJobPath); person = @{ employeeId = '' }; automationTaskIds = @() }
$operation = 'execute'

$script:RunLog = [System.Collections.Generic.List[object]]::new()
$script:Changes = [System.Collections.Generic.List[object]]::new()
$script:ActionResults = [System.Collections.Generic.List[object]]::new()
$script:MutationStarted = $false
$script:ActiveAction = ''
$script:RollbackObjects = @{}
$startedAt = Get-Date
$runId = [string]$job.jobId
$runStatus = 'completed'
$runError = ''
$referenceLookup = $null
$existingUser = $null
$adCredential = $null
$helpdeskCredential = $null
$initialPassword = $null
$script:CurrentAction = 'Initialisierung'

function Write-ProgressSnapshot {
    $temporaryPath = "$progressPath.tmp"
    try {
        $snapshot = [pscustomobject]@{
            status = 'running'
            startedAt = $startedAt.ToString('o')
            updatedAt = (Get-Date).ToString('o')
            currentAction = $script:CurrentAction
            log = $script:RunLog
        }
        $snapshot | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
        Move-Item -LiteralPath $temporaryPath -Destination $progressPath -Force
    } catch {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        Write-Warning "Progress snapshot could not be written: $($_.Exception.Message)"
    }
}

function Add-RunLog {
    param([string]$Action, [string]$State, [string]$Message)
    $script:CurrentAction = $Action
    $script:RunLog.Add([pscustomobject]@{ time = (Get-Date).ToString('o'); action = $Action; state = $State; message = $Message })
    Write-ProgressSnapshot
}

function Add-Change {
    param([string]$Action, [string]$ResourceType, [string]$ResourceId, [string]$Relation, $BeforeValue, $AfterValue, [string]$RollbackAction, [string]$State = '')
    if (-not $State) { $State = if ($Mode -eq 'WhatIf') { 'simulated' } else { 'completed' } }
    $memberId = $null
    if ($Mode -eq 'Execute' -and $ResourceType -in @('AD-Benutzer', 'AD-Computer', 'AD-Gruppe')) {
        $object = switch ($ResourceType) { 'AD-Benutzer' { Get-ADUser -Identity $ResourceId -Properties * @adArgs }; 'AD-Computer' { Get-ADComputer -Identity $ResourceId -Properties * @adArgs }; 'AD-Gruppe' { Get-ADGroup -Identity $ResourceId -Properties * @adArgs } }
        $ResourceId = [string]$object.ObjectGUID
        if ($ResourceType -eq 'AD-Gruppe') { $memberId = [string]$existingUser.ObjectGUID }
        if ($RollbackAction -in @('Remove-ADUser', 'Remove-ADComputer')) { $AfterValue = Get-ObjectSnapshot $object }
    }
    $script:Changes.Add([pscustomobject]@{
        id = "change-$([guid]::NewGuid().ToString('N'))"; action = $(if ($operation -eq 'execute') { $script:ActiveAction } else { $Action }); description = $Action; sourceChangeId = $(if ($operation -eq 'rollback') { $change.id } else { $null }); sourceAction = $(if ($operation -eq 'rollback') { $change.action } else { $null }); resourceType = $ResourceType; resourceId = $ResourceId
        relation = $Relation; memberId = $memberId; beforeValue = $BeforeValue; afterValue = $AfterValue; rollbackAction = $RollbackAction; status = $State
    })
    # The command returned and its attributable effect was read and recorded.
    # A later read/precondition failure can be retried without replaying this change.
    $script:MutationStarted = $false
}

function Invoke-ApprovedAction {
    param([string]$Action, [string]$Target, [scriptblock]$Operation)
    if ($Mode -eq 'WhatIf') { Add-RunLog $Action 'simulated' "Would change: $Target"; return $true }
    $script:MutationStarted = $true
    $null = & $Operation
    Add-RunLog $Action 'completed' $Target
    return $true
}

function Get-ParentDn { param([string]$DistinguishedName); return $DistinguishedName -replace '^[A-Z]{2}=(?:\\.|[^,])+,', '' }
function Read-StoredValue { param($Value); if ($null -eq $Value -or $Value -eq '') { return $null }; try { return ($Value | ConvertFrom-Json) } catch { return $Value } }
function Get-ObjectSnapshot {
    param($Object)
    $snapshot = [ordered]@{}
    foreach ($name in @('DistinguishedName', 'Name', 'SamAccountName', 'UserPrincipalName', 'Mail', 'GivenName', 'Surname', 'DisplayName', 'Title', 'Department', 'Description', 'EmployeeNumber', 'Company', 'ManagedBy', 'DNSHostName', 'OperatingSystem', 'OperatingSystemVersion', 'ServicePrincipalName', 'ServicePrincipalNames', 'PasswordLastSet', 'pwdLastSet', 'lastLogonTimestamp', 'logonCount', 'userAccountControl')) {
        $snapshot[$name] = if ($Object.PSObject.Properties[$name]) { if ($name -in @('ServicePrincipalName', 'ServicePrincipalNames')) { @($Object.$name | Sort-Object) } else { [string]$Object.$name } } else { if ($name -in @('ServicePrincipalName', 'ServicePrincipalNames')) { @() } else { '' } }
    }
    $snapshot.Enabled = if ($Object.PSObject.Properties['Enabled']) { [bool]$Object.Enabled } else { $false }
    $snapshot.MemberOf = if ($Object.PSObject.Properties['MemberOf']) { @($Object.MemberOf | Sort-Object) } else { @() }
    return [pscustomobject]$snapshot
}
function Assert-RollbackState {
    param($Change, [hashtable]$AdArguments)
    $identity = [guid]::Empty
    if (-not [guid]::TryParse([string]$Change.resourceId, [ref]$identity)) { throw 'Legacy or invalid AD identity: manual review required.' }
    $object = switch ([string]$Change.resourceType) { 'AD-Benutzer' { Get-ADUser -Identity $identity -Properties * @AdArguments }; 'AD-Computer' { Get-ADComputer -Identity $identity -Properties * @AdArguments }; default { Get-ADObject -Identity $identity -Properties * @AdArguments } }
    if ($Mode -eq 'WhatIf') {
        if (-not $script:RollbackObjects.ContainsKey([string]$identity)) { $script:RollbackObjects[[string]$identity] = $object | ConvertTo-Json -Depth 20 | ConvertFrom-Json }
        $object = $script:RollbackObjects[[string]$identity]
    }
    $expected = Read-StoredValue $Change.afterValue
    switch ([string]$Change.rollbackAction) {
        { $_ -in @('Remove-ADUser', 'Remove-ADComputer') } {
            if (-not $expected -or -not $expected.PSObject.Properties['distinguishedName']) { throw 'Expected creation snapshot missing.' }
            if ((Get-ObjectSnapshot $object | ConvertTo-Json -Depth 8 -Compress) -ne ($expected | ConvertTo-Json -Depth 8 -Compress)) { throw 'Object changed since creation; deletion blocked.' }
        }
        'Restore-ADComputerDescription' { if ([string]$object.Description -ne [string]$expected) { throw 'Description changed; rollback conflict.' } }
        'Enable-ADAccount' { if ([bool]$object.Enabled -ne [bool]$expected) { throw 'Account state changed; rollback conflict.' } }
        'Move-ADObject' { if ((Get-ParentDn $object.DistinguishedName) -ne [string]$expected) { throw 'OU changed; rollback conflict.' } }
        'Restore-ADUserAttributes' {
            foreach ($name in @('DisplayName', 'Title', 'Description', 'Department')) { if ([string]$object.$name -ne [string]$expected.$name) { throw "Attribute changed: $name; rollback conflict." } }
        }
        { $_ -in @('Remove-ADGroupMember', 'Add-ADGroupMember') } {
            $memberGuid = [guid]::Empty
            if (-not $Change.PSObject.Properties['memberId'] -or -not [guid]::TryParse([string]$Change.memberId, [ref]$memberGuid)) { throw 'Immutable member identity missing.' }
            $member = Get-ADObject -Identity $memberGuid -Properties MemberOf @AdArguments
            if ($Mode -eq 'WhatIf') {
                if (-not $script:RollbackObjects.ContainsKey([string]$memberGuid)) { $script:RollbackObjects[[string]$memberGuid] = $member | ConvertTo-Json -Depth 20 | ConvertFrom-Json }
                $member = $script:RollbackObjects[[string]$memberGuid]
            }
            $isMember = @($member.MemberOf) -contains [string]$object.DistinguishedName
            if ($isMember -ne [bool]$expected) { throw 'Group membership changed; rollback conflict.' }
        }
        default { throw 'Automatic rollback is not implemented for this change.' }
    }
    return $object
}
function Update-RollbackSimulation {
    param($Change)
    if ($Mode -ne 'WhatIf') { return }
    $object = $script:RollbackObjects[[string]$Change.resourceId]
    $before = Read-StoredValue $Change.beforeValue
    switch ([string]$Change.rollbackAction) {
        'Restore-ADComputerDescription' { $object.Description = [string]$before }
        'Enable-ADAccount' { $object.Enabled = [bool]$before }
        'Move-ADObject' { $object.DistinguishedName = ($object.DistinguishedName -replace ',OU=.*$', '') + ',' + [string]$before }
        'Restore-ADUserAttributes' { foreach ($name in @('DisplayName', 'Title', 'Description', 'Department')) { $object.$name = [string]$before.$name } }
        'Remove-ADGroupMember' { $member = $script:RollbackObjects[[string]$Change.memberId]; $member.MemberOf = @($member.MemberOf | Where-Object { $_ -ne $object.DistinguishedName }) }
        'Add-ADGroupMember' { $member = $script:RollbackObjects[[string]$Change.memberId]; $member.MemberOf = @($member.MemberOf) + @($object.DistinguishedName) }
    }
}
function Set-UserAttributes {
    param([string]$Identity, $Values, [hashtable]$AdArguments)
    $arguments = @{ Identity = $Identity }
    $clear = [Collections.Generic.List[string]]::new()
    foreach ($name in @('DisplayName', 'Title', 'Description', 'Department')) {
        if ([string]::IsNullOrEmpty([string]$Values.$name)) { $clear.Add($name) } else { $arguments[$name] = [string]$Values.$name }
    }
    if ($clear.Count) { $arguments.Clear = @($clear) }
    Set-ADUser @arguments @AdArguments
}
function Get-BoundDirectoryUser {
    param($Directory, $Person, [bool]$Creating, [hashtable]$AdArguments)
    $number = ([string]$Person.personnelNumber).Trim()
    if (-not $number) { throw 'Personnel number is required for safe directory account binding.' }
    if ($Directory.PSObject.Properties['objectGuid'] -and $Directory.objectGuid) {
        $guid = [guid]::Empty
        if (-not [guid]::TryParse([string]$Directory.objectGuid, [ref]$guid)) { throw 'Invalid bound directory GUID.' }
        $user = Get-ADUser -Identity $guid -Properties * @AdArguments
        if ([string]$user.EmployeeNumber -cne $number) { throw 'Bound directory GUID belongs to another personnel number; manual review required.' }
        return $user
    }
    $escapedNumber = $number.Replace("'", "''")
    $users = @(Get-ADUser -Filter "EmployeeNumber -eq '$escapedNumber'" -Properties * @AdArguments)
    if ($users.Count -gt 1) { throw 'Multiple AD accounts have this personnel number; manual review required.' }
    if ($users.Count -eq 1) { return $users[0] }
    $escapedSam = ([string]$Directory.samAccountName).Replace("'", "''")
    $users = @(Get-ADUser -Filter "SamAccountName -eq '$escapedSam'" -Properties * @AdArguments)
    if ($users.Count -gt 1) { throw 'Ambiguous AD account; manual review required.' }
    if ($users.Count -eq 1) {
        if ([string]$users[0].EmployeeNumber -cne $number) { throw 'Same-name AD account belongs to another personnel number; manual review required.' }
        return $users[0]
    }
    if (-not $Creating) { throw 'No AD account bound to this personnel number; manual review required.' }
    return $null
}
function Find-ReferenceUsers {
    param($ReferenceSpec, [hashtable]$AdArguments)
    $query = ([string]$ReferenceSpec.query).Trim()
    if (-not $query) { $query = ([string]$ReferenceSpec.displayName).Trim() }
    $escapedQuery = $query.Replace("'", "''")
    $matches = @(Get-ADUser -Filter "SamAccountName -eq '$escapedQuery' -or UserPrincipalName -eq '$escapedQuery' -or DisplayName -eq '$escapedQuery'" @AdArguments -Properties MemberOf,DistinguishedName,SamAccountName,DisplayName)
    if ($matches.Count -gt 0) { return $matches }

    $parts = @($query -split '\s+' | Where-Object { $_ })
    $surname = if ($ReferenceSpec.PSObject.Properties['surname'] -and $ReferenceSpec.surname) { [string]$ReferenceSpec.surname } elseif ($parts.Count -ge 2) { [string]$parts[-1] } else { '' }
    $initial = if ($ReferenceSpec.PSObject.Properties['givenNameInitial'] -and $ReferenceSpec.givenNameInitial) { [string]$ReferenceSpec.givenNameInitial } elseif ($parts.Count -ge 2) { ([string]$parts[0]).TrimEnd('.').Substring(0, 1) } else { '' }
    if (-not $surname -or -not $initial) { return @() }
    $escapedSurname = $surname.Replace("'", "''")
    $escapedInitial = $initial.Replace("'", "''")
    return @(Get-ADUser -Filter "Surname -eq '$escapedSurname' -and GivenName -like '$escapedInitial*'" @AdArguments -Properties MemberOf,DistinguishedName,SamAccountName,DisplayName)
}

Write-Host "IT Lifecycle agent - $operation / $Mode" -ForegroundColor Cyan
Write-Host 'Required credentials are loaded from one-time DPAPI files and are not written to the result file.' -ForegroundColor DarkGray

try {
    $jobJson = Get-Content -LiteralPath $resolvedJobPath -Raw -Encoding UTF8
    try { $parsedJob = $jobJson | ConvertFrom-Json } catch { throw 'Job file is not valid JSON.' } finally { $jobJson = $null }
    if ($parsedJob -isnot [pscustomobject]) { throw 'Job must be a JSON object.' }
    $job = $parsedJob
    if ($job.schemaVersion -ne 1) { throw 'Unsupported job schema. Expected schemaVersion 1.' }
    $runId = if ($job.PSObject.Properties['runId']) { [string]$job.runId } else { [string]$job.jobId }
    if ($Mode -eq 'Job') { $Mode = [string]$job.requestedMode }
    if ($Mode -notin @('Execute', 'WhatIf') -or $Mode -ne $job.requestedMode) { throw 'Job mode mismatch.' }
    $operation = [string]$job.operation
    if ($operation -notin @('execute', 'rollback', 'reference_check')) { throw 'Unsupported operation.' }
    $configuredDomain = if ($env:AD_DOMAIN) { $env:AD_DOMAIN.Trim() } else { 'kauth.local' }
    if ($job.directory.domain -ine $configuredDomain) { throw 'Directory domain differs from trusted local configuration.' }
    if ($Mode -eq 'Execute' -and (-not $job.PSObject.Properties['executeApproved'] -or $job.executeApproved -ne $true)) { throw 'Execute requires explicit approval.' }
    $actionTypes = @()
    if ($operation -eq 'execute') {
        if (-not $job.PSObject.Properties['actions'] -or @($job.actions).Count -eq 0) { throw 'Execute job requires actions.' }
        $actionTypes = @($job.actions | ForEach-Object { [string]$_.type })
    } elseif ($operation -eq 'rollback' -and (-not $job.PSObject.Properties['originalRun'] -or $job.originalRun.mode -ne 'Execute')) { throw 'Rollback requires an executed source run.' }
    if ($TestAdapterPath) {
        if ($env:IT_LIFECYCLE_TEST_MODE -ne '1') { throw 'Test adapter requires isolated test mode.' }
        . $TestAdapterPath
    }
    if (-not $TestAdapterPath) {
        if ($actionTypes -contains 'CreateHelpdeskTicket') {
            $configuredHelpdesk = if ($env:HELPDESK_BASE_URL) { $env:HELPDESK_BASE_URL.TrimEnd('/') } else { 'http://pk-srvhlpdsk001:8002' }
            if ($job.helpdesk.baseUrl.TrimEnd('/') -cne $configuredHelpdesk) { throw 'HelpDesk target differs from trusted local configuration.' }
        }
        if ($actionTypes -contains 'ProvisionM365Mailbox') {
            $configuredSync = if ($env:M365_SYNC_SERVER) { $env:M365_SYNC_SERVER } else { 'PK-SRVMGMT001' }
            if ($job.microsoft365.syncServer -ine $configuredSync) { throw 'ADSync target differs from trusted local configuration.' }
        }
    }
    $requiresAdCredential = $operation -in @('rollback', 'reference_check') -or @($actionTypes | Where-Object { $_ -ne 'CreateHelpdeskTicket' }).Count -gt 0
    $requiresDirectoryConnection = $operation -in @('rollback', 'reference_check') -or @($actionTypes | Where-Object { $_ -notin @('CreateHelpdeskTicket', 'ProvisionM365Mailbox') }).Count -gt 0
    if ($requiresAdCredential -and $CredentialPath) {
        try {
            $adCredential = Import-Clixml -LiteralPath $CredentialPath
        } finally {
            Remove-Item -LiteralPath $CredentialPath -Force -ErrorAction SilentlyContinue
        }
        if ($adCredential -isnot [Management.Automation.PSCredential]) { throw 'The supplied AD credential could not be read.' }
    } elseif ($requiresAdCredential) { throw 'No AD credential was supplied. Interactive prompts are disabled for gateway jobs.' }
    if ($InitialPasswordPath) {
        try {
            $initialPasswordCredential = Import-Clixml -LiteralPath $InitialPasswordPath
        } finally {
            Remove-Item -LiteralPath $InitialPasswordPath -Force -ErrorAction SilentlyContinue
        }
        if ($initialPasswordCredential -isnot [Management.Automation.PSCredential]) { throw 'The supplied initial user password could not be read.' }
        $initialPassword = $initialPasswordCredential.Password
        $initialPasswordCredential = $null
    }
    if ($HelpdeskCredentialPath) {
        try {
            $helpdeskCredential = Import-Clixml -LiteralPath $HelpdeskCredentialPath
        } finally {
            Remove-Item -LiteralPath $HelpdeskCredentialPath -Force -ErrorAction SilentlyContinue
        }
        if ($helpdeskCredential -isnot [Management.Automation.PSCredential]) { throw 'The supplied HelpDesk credential could not be read.' }
    }
    if ($requiresDirectoryConnection) {
        Add-RunLog 'AD-Verbindung pruefen' 'running' $job.directory.domain
        if (-not $TestAdapterPath) { Import-Module ActiveDirectory -ErrorAction Stop }
        $null = Get-ADDomain -Identity $job.directory.domain -Server $job.directory.domain -Credential $adCredential
        $adArgs = @{ Server = $job.directory.domain; Credential = $adCredential; ErrorAction = 'Stop' }
        Add-RunLog 'AD-Verbindung pruefen' 'completed' $job.directory.domain
    }

    if ($operation -eq 'reference_check') {
        $query = [string]$job.directory.referenceUser.query
        Add-RunLog 'Referenzbenutzer suchen' 'running' $query
        $referenceUsers = @(Find-ReferenceUsers $job.directory.referenceUser $adArgs)
        if ($referenceUsers.Count -eq 1) {
            $matchedUser = $referenceUsers[0]
            $referenceLookup = [pscustomobject]@{
                query = $query; status = 'found'; count = 1; samAccountName = [string]$matchedUser.SamAccountName
                displayName = [string]$matchedUser.DisplayName; distinguishedName = [string]$matchedUser.DistinguishedName
                targetOu = Get-ParentDn $matchedUser.DistinguishedName
            }
            Add-RunLog 'Reference user lookup' 'completed' "$($matchedUser.SamAccountName): $($referenceLookup.targetOu)"
        } else {
            $lookupStatus = if ($referenceUsers.Count -eq 0) { 'not_found' } else { 'ambiguous' }
            $referenceLookup = [pscustomobject]@{ query = $query; status = $lookupStatus; count = $referenceUsers.Count }
            Add-RunLog 'Reference user lookup' $lookupStatus "$query; matches=$($referenceUsers.Count)"
        }
    } elseif ($operation -eq 'rollback') {
        $rollbackChanges = @($job.originalRun.changes)
        [array]::Reverse($rollbackChanges)
        foreach ($change in $rollbackChanges) {
            if ($change.status -ne 'completed' -or $change.rollbackAction -eq 'manual') { continue }
            $rollbackAction = [string]$change.rollbackAction
            $resourceId = [string]$change.resourceId
            $script:MutationStarted = $false
            try {
            $null = Assert-RollbackState $change $adArgs
            switch ($rollbackAction) {
                'Remove-ADUser' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Remove-ADUser -Identity $resourceId -Confirm:$false @adArgs }) { Add-Change $rollbackAction 'Rollback' $resourceId 'Benutzerkonto der Mitarbeiterakte' $change.afterValue $null 'manual' }
                }
                'Remove-ADComputer' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Remove-ADComputer -Identity $resourceId -Confirm:$false @adArgs }) { Add-Change $rollbackAction 'Rollback' $resourceId 'Geraet der Mitarbeiterakte' $change.afterValue $null 'manual' }
                }
                'Restore-ADComputerDescription' {
                    $originalDescription = Read-StoredValue $change.beforeValue
                    $restoreDescription = {
                        if ($null -eq $originalDescription -or [string]::IsNullOrEmpty([string]$originalDescription)) {
                            Set-ADComputer -Identity $resourceId -Clear Description @adArgs
                        } else {
                            Set-ADComputer -Identity $resourceId -Description ([string]$originalDescription) @adArgs
                        }
                    }
                    if (Invoke-ApprovedAction $rollbackAction $resourceId $restoreDescription) { Add-Change 'Computerbeschreibung wiederhergestellt' 'Rollback' $resourceId 'Nur Beschreibung; alle anderen Eigenschaften unveraendert' $change.afterValue $originalDescription 'manual' }
                }
                'Remove-ADGroupMember' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Remove-ADGroupMember -Identity $resourceId -Members $change.memberId -Confirm:$false @adArgs }) { Add-Change $rollbackAction 'Rollback' $resourceId "Mitglied: $($change.memberId)" $true $false 'manual' }
                }
                'Add-ADGroupMember' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Add-ADGroupMember -Identity $resourceId -Members $change.memberId @adArgs }) { Add-Change $rollbackAction 'Rollback' $resourceId "Mitglied: $($change.memberId)" $false $true 'manual' }
                }
                'Enable-ADAccount' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Enable-ADAccount -Identity $resourceId @adArgs }) { Add-Change $rollbackAction 'Rollback' $resourceId 'Kontostatus' $false $true 'Disable-ADAccount' }
                }
                'Move-ADObject' {
                    $originalOu = [string](Read-StoredValue $change.beforeValue)
                    if (-not $originalOu) { throw "Original OU missing for $resourceId" }
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Move-ADObject -Identity $resourceId -TargetPath $originalOu @adArgs }) { Add-Change $rollbackAction 'Rollback' $resourceId 'Organisationseinheit' $change.afterValue $originalOu 'Move-ADObject' }
                }
                'Restore-ADUserAttributes' {
                    $before = Read-StoredValue $change.beforeValue
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Set-UserAttributes $resourceId $before $adArgs }) { Add-Change $rollbackAction 'Rollback' $resourceId 'User attributes' $change.afterValue $before 'manual' }
                }
                default { Add-RunLog 'Rollback manual' 'skipped' "$($change.action): $resourceId" }
            }
            Update-RollbackSimulation $change
            $script:ActionResults.Add([pscustomobject]@{ action = $rollbackAction; status = $(if ($Mode -eq 'WhatIf') { 'simulated' } else { 'completed' }) })
            } catch {
                $script:ActionResults.Add([pscustomobject]@{ action = $rollbackAction; status = 'review_required'; error = $_.Exception.Message })
                Add-RunLog $rollbackAction 'review_required' $_.Exception.Message
                $runStatus = 'partial'; $runError = 'Rollback requires manual review.'
            }
        }
    } else {
        $createUserRequested = @($job.actions | Where-Object { $_.type -eq 'CreateAdUser' }).Count -gt 0
        $computerActionRequested = @($job.actions | Where-Object { $_.type -like 'CreateAdComputer:*' }).Count -gt 0
        $referenceActionRequested = @($job.actions | Where-Object { $_.type -eq 'CopyGroupsFromReference' }).Count -gt 0
        $existingUser = $null
        $referenceUser = $null
        $resolvedTargetOu = [string]$job.directory.targetOu
        if ($requiresDirectoryConnection) {
            if ($job.directory.samAccountName -notmatch '^[a-z0-9.-]+$') { throw 'Invalid sAMAccountName in job.' }
            if ($Mode -eq 'Execute' -and $createUserRequested -and $job.lifecycleType -ne 'offboarding' -and $job.directory.targetOu -eq 'REVIEW_REQUIRED') { throw 'Select and approve a target OU in the job before running the agent.' }
            if ($Mode -eq 'Execute' -and $computerActionRequested -and @($job.directory.computers | Where-Object { $_.mode -ne 'existing' -and ($_.prefix -eq 'REVIEW_REQUIRED' -or $_.targetOu -eq 'REVIEW_REQUIRED') }).Count) { throw 'Select and approve the location and computer OU before running the agent.' }

            Add-RunLog 'Vorbedingungen pruefen' 'running' $job.directory.samAccountName
            $existingUser = Get-BoundDirectoryUser $job.directory $job.person $createUserRequested $adArgs
            if ($existingUser -and -not $createUserRequested) {
                # Subsequent actions target the verified account, including HR surname changes.
                $job.directory.samAccountName = [string]$existingUser.SamAccountName
                $job.directory.userPrincipalName = [string]$existingUser.UserPrincipalName
            }
            if ($createUserRequested) {
                if ($existingUser) {
                    throw "AD-Benutzer '$($job.directory.samAccountName)' existiert bereits als '$($existingUser.DisplayName)' ($($existingUser.DistinguishedName)). Der Lauf wurde vor weiteren Aenderungen gestoppt."
                }
                if ($Mode -eq 'Execute' -and -not $initialPassword) {
                    throw 'Fuer die aktivierte Benutzeranlage wurde kein initiales Benutzerkennwort uebergeben.'
                }
                Add-RunLog 'Vorbedingungen pruefen' 'completed' 'Kein vorhandenes Zielkonto gefunden.'
            } else {
                Add-RunLog 'Vorbedingungen pruefen' 'completed' $(if ($existingUser) { "Zielkonto gefunden: $($existingUser.DistinguishedName)" } else { 'Zielkonto wurde nicht gefunden.' })
            }
            if ($job.directory.referenceUser -and ($referenceActionRequested -or ($createUserRequested -and $resolvedTargetOu -eq 'REFERENCE_USER_OU'))) {
                $referenceUsers = @(Find-ReferenceUsers $job.directory.referenceUser $adArgs)
                if ($referenceUsers.Count -ne 1) { throw "Reference user '$($job.directory.referenceUser.displayName)' is not unique. Found: $($referenceUsers.Count)." }
                $referenceUser = $referenceUsers[0]
                if ($resolvedTargetOu -eq 'REFERENCE_USER_OU') { $resolvedTargetOu = Get-ParentDn $referenceUser.DistinguishedName }
            }
        }
        $assignedGroups = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        if ($existingUser) { foreach ($groupDn in @($existingUser.MemberOf)) { $null = $assignedGroups.Add([string]$groupDn) } }

        foreach ($action in $job.actions) {
            $actionType = [string]$action.type
            $actionTarget = [string]$action.target
            $script:ActiveAction = $actionType
            $script:MutationStarted = $false
            if ($Mode -eq 'Execute' -and $createUserRequested -and -not $existingUser -and $actionType -ne 'CreateAdUser') {
                $script:ActionResults.Add([pscustomobject]@{ action = $actionType; status = 'failed'; error = 'Dependent account creation did not complete; action was not started.' })
                continue
            }
            try {
            Add-RunLog $actionType 'running' $actionTarget
            switch -Wildcard ($actionType) {
                'CreateAdUser' {
                    $adDisplayName = "$($job.person.lastName), $($job.person.firstName)"
                    $newUserArgs = @{
                        Name = $adDisplayName; GivenName = $job.person.firstName; Surname = $job.person.lastName; DisplayName = $adDisplayName
                        SamAccountName = $job.directory.samAccountName; UserPrincipalName = $job.directory.userPrincipalName; EmailAddress = $job.directory.mail
                        EmployeeNumber = $job.person.personnelNumber; Department = $job.person.department; Description = $job.directory.description
                        Title = $job.directory.title; Company = $job.person.company; Path = $resolvedTargetOu; Enabled = ($Mode -eq 'Execute')
                    }
                    if ($Mode -eq 'Execute') {
                        $newUserArgs.AccountPassword = $initialPassword
                        $newUserArgs.ChangePasswordAtLogon = $true
                    }
                    $changed = Invoke-ApprovedAction 'Aktivierten AD-Benutzer anlegen' $job.directory.userPrincipalName { New-ADUser @newUserArgs @adArgs }
                    if ($Mode -eq 'Execute' -and $changed) {
                        $existingUser = Get-ADUser -Identity $job.directory.samAccountName @adArgs -Properties MemberOf,Mail,Enabled,DistinguishedName
                        if (-not [bool]$existingUser.Enabled) { throw "AD-Benutzer '$($job.directory.samAccountName)' wurde angelegt, ist aber nicht aktiviert. Bitte Kennwortrichtlinie pruefen." }
                        Add-Change 'Aktivierten Benutzer angelegt' 'AD-Benutzer' $existingUser.SamAccountName "Anzeigename: $adDisplayName; Kennwortwechsel bei Anmeldung" $null $existingUser.DistinguishedName 'Remove-ADUser'
                    } elseif ($Mode -eq 'WhatIf') { Add-Change 'Aktivierten Benutzer anlegen' 'AD-Benutzer' $job.directory.samAccountName "Anzeigename: $adDisplayName; Kennwortwechsel bei Anmeldung" $null $resolvedTargetOu 'manual' 'simulated' }
                }
                'CopyGroupsFromReference' {
                    if (-not $referenceUser) { throw 'Reference user action exists without a unique reference user.' }
                    foreach ($groupDn in @($referenceUser.MemberOf)) {
                        $referenceGroup = Get-ADGroup -Identity $groupDn -Properties AdminCount,SID @adArgs
                        if (($referenceGroup.PSObject.Properties['AdminCount'] -and $referenceGroup.AdminCount -eq 1) -or ($referenceGroup.PSObject.Properties['SID'] -and [string]$referenceGroup.SID -match '-(512|516|518|519|520|544)$')) {
                            Add-RunLog 'Copy reference group membership' 'skipped' 'Protected administrative group excluded.'; continue
                        }
                        $alreadyMember = $assignedGroups.Contains([string]$groupDn)
                        if ($alreadyMember) { Add-RunLog 'Copy reference group membership' 'skipped' "$groupDn already assigned"; continue }
                        if (Invoke-ApprovedAction 'Copy reference group membership' $groupDn { Add-ADGroupMember -Identity $groupDn -Members $job.directory.samAccountName @adArgs }) { $null = $assignedGroups.Add([string]$groupDn); Add-Change 'Gruppenmitgliedschaft kopiert' 'AD-Gruppe' $groupDn "Referenz: $($referenceUser.SamAccountName) -> Mitglied: $($job.directory.samAccountName)" $false $true 'Remove-ADGroupMember' }
                    }
                }
                'UpdateAdUser' {
                    if (-not $existingUser) { throw 'Existing AD account is required for lifecycle change.' }
                    $current = Get-ADUser -Identity $existingUser.ObjectGUID -Properties DisplayName,Title,Description,Department @adArgs
                    $before = @{ DisplayName = [string]$current.DisplayName; Title = [string]$current.Title; Description = [string]$current.Description; Department = [string]$current.Department }
                    $after = @{ DisplayName = "$($job.person.lastName), $($job.person.firstName)"; Title = [string]$job.directory.title; Description = [string]$job.directory.description; Department = [string]$job.person.department }
                    if (($before | ConvertTo-Json -Compress) -ne ($after | ConvertTo-Json -Compress)) {
                        if (Invoke-ApprovedAction 'Update AD user attributes' $existingUser.SamAccountName { Set-UserAttributes ([string]$existingUser.ObjectGUID) $after $adArgs }) { Add-Change 'Benutzer aktualisiert' 'AD-Benutzer' $existingUser.SamAccountName 'User attributes' $before $after 'Restore-ADUserAttributes' }
                    }
                    if ($resolvedTargetOu -and $resolvedTargetOu -notin @('REVIEW_REQUIRED', 'REFERENCE_USER_OU')) {
                        $current = Get-ADUser -Identity $existingUser.ObjectGUID -Properties DistinguishedName @adArgs
                        $oldOu = Get-ParentDn $current.DistinguishedName
                        if ($oldOu -ne $resolvedTargetOu) {
                            $null = Get-ADOrganizationalUnit -Identity $resolvedTargetOu @adArgs
                            if (Invoke-ApprovedAction 'Move AD user for lifecycle change' $resolvedTargetOu { Move-ADObject -Identity $existingUser.ObjectGUID -TargetPath $resolvedTargetOu @adArgs }) { Add-Change 'Benutzer verschoben' 'AD-Benutzer' $existingUser.SamAccountName 'Organisationseinheit' $oldOu $resolvedTargetOu 'Move-ADObject' }
                        }
                    }
                }
                'AddGroup:*' {
                    $groupName = $actionType.Substring(9)
                    $group = Get-ADGroup -Identity $groupName @adArgs
                    $alreadyMember = $assignedGroups.Contains([string]$group.DistinguishedName)
                    if ($alreadyMember) { Add-RunLog 'Add AD group membership' 'skipped' "$groupName already assigned"; break }
                    if (Invoke-ApprovedAction 'Add AD group membership' $groupName { Add-ADGroupMember -Identity $groupName -Members $job.directory.samAccountName @adArgs }) { $null = $assignedGroups.Add([string]$group.DistinguishedName); Add-Change 'Gruppenmitgliedschaft hinzugefuegt' 'AD-Gruppe' $group.DistinguishedName "Mitglied: $($job.directory.samAccountName)" $false $true 'Remove-ADGroupMember' }
                }
                'SnapshotAdAccount' {
                    if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
                    Add-RunLog $actionType 'completed' "Enabled=$($existingUser.Enabled); Groups=$($existingUser.MemberOf.Count); DN=$($existingUser.DistinguishedName)"
                }
                'DisableAdUser' {
                    if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
                    if ([bool]$existingUser.Enabled -and (Invoke-ApprovedAction 'Disable AD account' $job.directory.samAccountName { Disable-ADAccount -Identity $existingUser @adArgs })) { Add-Change 'Benutzer deaktiviert' 'AD-Benutzer' $existingUser.SamAccountName 'Kontostatus' $true $false 'Enable-ADAccount' }
                }
                'RemoveGroupMemberships' {
                    if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
                    foreach ($groupDn in @($existingUser.MemberOf)) {
                        if (Invoke-ApprovedAction 'Remove AD group membership' $groupDn { Remove-ADGroupMember -Identity $groupDn -Members $existingUser -Confirm:$false @adArgs }) { Add-Change 'Gruppenmitgliedschaft entfernt' 'AD-Gruppe' $groupDn "Mitglied: $($job.directory.samAccountName)" $true $false 'Add-ADGroupMember' }
                    }
                }
                'MoveAdUser' {
                    if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
                    $disabledOu = [string]$job.directory.disabledOu
                    $null = Get-ADOrganizationalUnit -Identity $disabledOu @adArgs
                    $originalOu = Get-ParentDn $existingUser.DistinguishedName
                    if (Invoke-ApprovedAction 'Move AD account' $disabledOu { Move-ADObject -Identity $existingUser.DistinguishedName -TargetPath $disabledOu @adArgs }) { Add-Change 'Benutzer verschoben' 'AD-Benutzer' $existingUser.SamAccountName 'Organisationseinheit' $originalOu $disabledOu 'Move-ADObject' }
                }
                'CreateAdComputer:*' {
                    $computerType = $actionType.Substring(17)
                    $computerPlan = @($job.directory.computers | Where-Object { $_.type -eq $computerType }) | Select-Object -First 1
                    if (-not $computerPlan) { throw "Computer plan '$computerType' was not found." }
                    $prefix = [string]$computerPlan.prefix
                    if ($prefix -notmatch '^[A-Z]{2,5}-CL(NB|WS)$') { throw "Invalid computer prefix: $prefix" }
                    $targetOu = [string]$computerPlan.targetOu
                    $null = Get-ADOrganizationalUnit -Identity $targetOu @adArgs
                    $numbers = Get-ADComputer -Filter "Name -like '$prefix*'" @adArgs | ForEach-Object { if ($_.Name -match ('^' + [regex]::Escape($prefix) + '(\d+)$')) { [int]$Matches[1] } }
                    $nextNumber = if ($numbers) { ($numbers | Measure-Object -Maximum).Maximum + 1 } else { 1 }
                    do {
                        $computerName = $prefix + $nextNumber.ToString('000')
                        if ($computerName.Length -gt 15) { throw 'Generated AD computer name exceeds 15 characters; choose another prefix or numbering range.' }
                        $computerExists = Get-ADComputer -Filter "Name -eq '$computerName'" @adArgs
                        if ($computerExists) { $nextNumber++ }
                    } while ($computerExists)
                    $managedBy = if ($existingUser) { $existingUser.DistinguishedName } else { $job.directory.samAccountName }
                    $computerArgs = @{ Name = $computerName; SamAccountName = "$computerName`$"; Path = $targetOu; Description = $computerPlan.description; ManagedBy = $managedBy; Enabled = $true }
                    if (Invoke-ApprovedAction "Create AD computer ($computerType)" $computerName { New-ADComputer @computerArgs @adArgs }) { Add-Change "$computerType angelegt" 'AD-Computer' $computerName "Geraet von $($job.person.displayName); verwaltet durch $($job.directory.samAccountName)" $null @{ ou = $targetOu; description = $computerPlan.description; managedBy = $managedBy } 'Remove-ADComputer' }
                }
                'ReuseAdComputer:*' {
                    $computerType = $actionType.Substring(16)
                    $computerPlan = @($job.directory.computers | Where-Object { $_.type -eq $computerType }) | Select-Object -First 1
                    if (-not $computerPlan) { throw "Computer plan '$computerType' was not found." }
                    $computerName = ([string]$computerPlan.existingName).Trim().ToUpperInvariant()
                    if ($computerName -notmatch '^[A-Z0-9-]{1,15}$') { throw "Invalid existing computer name: $computerName" }
                    $existingComputer = Get-ADComputer -Identity $computerName -Properties Description,DistinguishedName @adArgs
                    $oldDescription = if ($null -eq $existingComputer.Description) { $null } else { [string]$existingComputer.Description }
                    $newDescription = [string]$computerPlan.description
                    if ($oldDescription -eq $newDescription) {
                        Add-RunLog "Reuse AD computer ($computerType)" 'skipped' "$computerName already has the requested description."
                        break
                    }
                    if (Invoke-ApprovedAction "Update AD computer description ($computerType)" $computerName { Set-ADComputer -Identity $existingComputer -Description $newDescription @adArgs }) {
                        Add-Change 'Computerbeschreibung aktualisiert' 'AD-Computer' $computerName "Geraet von $($job.person.displayName); nur Beschreibung geaendert" $oldDescription $newDescription 'Restore-ADComputerDescription'
                    }
                }
                'ProvisionM365Mailbox' {
                    $upn = [string]$job.directory.userPrincipalName
                    $syncServer = [string]$job.microsoft365.syncServer
                    $skuPartNumber = [string]$job.microsoft365.skuPartNumber
                    $usageLocation = [string]$job.microsoft365.usageLocation
                    if ($Mode -eq 'WhatIf') {
                        Add-RunLog $actionType 'simulated' "Delta-Sync auf $syncServer; Entra-Benutzer abwarten; freie Lizenz $skuPartNumber pruefen und zuweisen; Exchange-Online-Postfach $upn abwarten"
                        Add-Change 'Microsoft-365-Postfach bereitstellen' 'Exchange-Online-Postfach' $upn "Lizenz: $skuPartNumber; Sync: $syncServer" $null 'Postfach bereit' 'manual' 'simulated'
                        break
                    }
                    foreach ($variableName in @('M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CERT_THUMBPRINT', 'M365_ORGANIZATION')) {
                        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($variableName))) {
                            throw "Jobserver-Konfiguration fehlt: $variableName"
                        }
                    }
                    foreach ($moduleName in @('Microsoft.Graph.Authentication', 'Microsoft.Graph.Users', 'Microsoft.Graph.Users.Actions', 'Microsoft.Graph.Identity.DirectoryManagement')) {
                        if (-not $TestAdapterPath -and -not (Get-Module -ListAvailable -Name $moduleName)) { throw "PowerShell-Modul fehlt auf dem Jobserver: $moduleName" }
                        if (-not $TestAdapterPath) { Import-Module $moduleName -ErrorAction Stop }
                    }
                    Add-RunLog $actionType 'running' 'Verbindung zu Microsoft Graph wird aufgebaut.'
                    $graphConnected = $false
                    try {
                        Connect-MgGraph -TenantId $env:M365_TENANT_ID -ClientId $env:M365_CLIENT_ID -CertificateThumbprint $env:M365_CERT_THUMBPRINT -NoWelcome
                        $graphConnected = $true
                        Add-RunLog $actionType 'running' "Delta-Synchronisierung auf $syncServer wird gestartet."
                        try {
                            Invoke-Command -ComputerName $syncServer -Credential $adCredential -ErrorAction Stop -ScriptBlock {
                                Import-Module ADSync -ErrorAction Stop
                                Start-ADSyncSyncCycle -PolicyType Delta -InteractiveMode $false
                            } | Out-Null
                        } catch {
                            throw "ADSync auf '$syncServer' konnte mit dem angegebenen AD-Konto nicht gestartet werden. Pruefe Benutzername im Format KAUTH\benutzername, Kennwort, WinRM-Berechtigung und ADSync-Rechte. Ursache: $($_.Exception.Message)"
                        }
                        Add-RunLog $actionType 'running' "Warte auf Entra-ID-Benutzer $upn."
                        $userSyncTimeoutMinutes = [int]$job.microsoft365.userSyncTimeoutMinutes
                        $userDeadline = (Get-Date).AddMinutes($userSyncTimeoutMinutes)
                        $cloudUser = $null
                        do {
                            try { $cloudUser = Get-MgUser -UserId $upn -Property Id,UserPrincipalName,UsageLocation,AssignedLicenses -ErrorAction Stop } catch { $cloudUser = $null }
                            if (-not $cloudUser) { Start-Sleep -Seconds 15 }
                        } until ($cloudUser -or (Get-Date) -ge $userDeadline)
                        if (-not $cloudUser) { throw "Der Benutzer $upn wurde innerhalb von $userSyncTimeoutMinutes Minuten nicht nach Entra ID synchronisiert." }
                        Add-RunLog $actionType 'running' "Entra-ID-Benutzer gefunden. Lizenz $skuPartNumber wird geprueft."
                        if (-not $cloudUser.UsageLocation) {
                            $script:MutationStarted = $true; Update-MgUser -UserId $cloudUser.Id -UsageLocation $usageLocation
                            $script:MutationStarted = $false; Add-Change 'Nutzungsstandort gesetzt' 'Entra-ID-Benutzer' $upn 'Voraussetzung fuer Lizenzzuweisung' $null $usageLocation 'manual'
                        }
                        $sku = Get-MgSubscribedSku -All | Where-Object { $_.SkuPartNumber -eq $skuPartNumber } | Select-Object -First 1
                        if (-not $sku) { throw "Microsoft-365-Lizenz '$skuPartNumber' wurde im Mandanten nicht gefunden." }
                        $alreadyLicensed = @($cloudUser.AssignedLicenses | Where-Object { $_.SkuId -eq $sku.SkuId }).Count -gt 0
                        if (-not $alreadyLicensed) {
                            $freeLicenses = [int]$sku.PrepaidUnits.Enabled - [int]$sku.PrepaidUnits.Warning - [int]$sku.ConsumedUnits
                            if ($freeLicenses -lt 1) {
                                throw "Keine freie Microsoft 365 Business Premium Lizenz ($skuPartNumber). Belegte Lizenzen: $($sku.ConsumedUnits), aktiv: $($sku.PrepaidUnits.Enabled), Warnung: $($sku.PrepaidUnits.Warning). Erst Lizenzen bereinigen und danach diese Aktion einzeln erneut starten."
                            }
                            $script:MutationStarted = $true; Set-MgUserLicense -UserId $cloudUser.Id -AddLicenses @(@{ SkuId = $sku.SkuId }) -RemoveLicenses @() | Out-Null
                            $script:MutationStarted = $false; Add-Change 'Microsoft-365-Lizenz zugewiesen' 'Microsoft-365-Lizenz' $skuPartNumber "Benutzer: $upn" $false $true 'manual'
                        } else {
                            Add-RunLog $actionType 'running' "Lizenz $skuPartNumber ist bereits zugewiesen."
                        }
                        Add-RunLog $actionType 'running' "Warte auf Exchange-Online-Postfach $upn."
                        $mailboxTimeoutMinutes = [int]$job.microsoft365.mailboxTimeoutMinutes
                        $exchangeHelper = Join-Path $PSScriptRoot 'Invoke-ExchangeMailboxCheck.ps1'
                        if (-not (Test-Path -LiteralPath $exchangeHelper)) { throw "Exchange-Hilfsskript fehlt: $exchangeHelper" }
                        if ($TestAdapterPath) {
                            $exchangeOutput = @(Invoke-TestMailboxCheck -UserPrincipalName $upn)
                            $LASTEXITCODE = 0
                        } else {
                        $exchangeOutput = & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File $exchangeHelper `
                            -ClientId $env:M365_CLIENT_ID `
                            -CertificateThumbprint $env:M365_CERT_THUMBPRINT `
                            -Organization $env:M365_ORGANIZATION `
                            -Mode WaitMailbox `
                            -UserPrincipalName $upn `
                            -TimeoutMinutes $mailboxTimeoutMinutes 2>&1
                        }
                        if ($LASTEXITCODE -ne 0) { throw "Exchange Online: $($exchangeOutput -join ' ') Diese Aktion spaeter erneut starten." }
                        $exchangeResult = $exchangeOutput[-1] | ConvertFrom-Json
                        Add-Change 'Exchange-Online-Postfach bereit' 'Exchange-Online-Postfach' $upn "Mitarbeiter: $($job.person.displayName)" $null ([string]$exchangeResult.mailboxId) 'manual'
                        Add-RunLog $actionType 'completed' "Lizenz $skuPartNumber und Postfach $upn sind bereit."
                    } finally {
                        if ($graphConnected) { Disconnect-MgGraph -ErrorAction SilentlyContinue }
                    }
                }
                'CreateHelpdeskTicket' {
                    if ($Mode -eq 'WhatIf') { Add-RunLog $actionType 'simulated' $job.helpdesk.subject; Add-Change 'Helpdesk-Ticket erstellen' 'Helpdesk-Ticket' $job.helpdesk.subject "Vorgang fuer $($job.person.displayName)" $null $job.helpdesk.text 'manual' 'simulated'; break }
                    $ticketFields = @{ subject = $job.helpdesk.subject }
                    $actionArguments = @{}
                    if ($job.helpdesk.PSObject.Properties['resource'] -and $job.helpdesk.resource) {
                        # Der lokalisierte Feldname wird von i-net akzeptiert. Der Wert kann je nach Installation
                        # der Ressourcenname oder die Ressourcen-GUID sein.
                        $ticketFields['Ressource'] = [string]$job.helpdesk.resource
                        $actionArguments['ticketextension.dispatchNow'] = 'IF_RESOURCE_AVAILABLE'
                    }
                    $body = @{ text = $job.helpdesk.text; htmlContent = $false; ticketFields = $ticketFields; actionArguments = $actionArguments } | ConvertTo-Json -Depth 8
                    if (-not $helpdeskCredential) { throw 'Fuer das HelpDesk-Ticket wurde keine separate Windows-Anmeldung uebergeben.' }
                    try {
                        $script:MutationStarted = $true; $ticket = Invoke-RestMethod -Uri "$($job.helpdesk.baseUrl.TrimEnd('/'))/api/ticket/create" -Method Post -Credential $helpdeskCredential -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 60
                    } catch {
                        if ($_.Exception.PSObject.Properties['Response'] -and $_.Exception.Response -and [int]$_.Exception.Response.StatusCode -in @(401, 403)) { $script:MutationStarted = $false }
                        throw "HelpDesk-Ticket konnte nicht erstellt werden. Die separate HelpDesk-Windows-Anmeldung wurde abgelehnt oder die API ist nicht erreichbar: $($_.Exception.Message)"
                    }
                    $ticketId = if ($ticket -is [ValueType] -or $ticket -is [string]) { [string]$ticket } elseif ($ticket.PSObject.Properties['id']) { [string]$ticket.id } elseif ($ticket.PSObject.Properties['ticketId']) { [string]$ticket.ticketId } else { '' }
                    if ([string]::IsNullOrWhiteSpace($ticketId)) { throw 'HelpDesk response has no ticket identity; inspect creation manually before retry.' }
                    Add-RunLog $actionType 'completed' "Ticket: $ticketId"
                    Add-Change 'Helpdesk-Ticket erstellt' 'Helpdesk-Ticket' $ticketId "Vorgang fuer $($job.person.displayName)" $null $job.helpdesk.subject 'manual'
                }
                default { throw "Unknown action type: $actionType" }
            }

            $script:ActionResults.Add([pscustomobject]@{ action = $actionType; status = $(if ($Mode -eq 'WhatIf') { 'simulated' } else { 'completed' }) })
            } catch {
                $state = if ($script:MutationStarted) { 'review_required' } else { 'failed' }
                $script:ActionResults.Add([pscustomobject]@{ action = $actionType; status = $state; error = $_.Exception.Message })
                Add-RunLog $actionType $state $_.Exception.Message
                $runStatus = if ($script:MutationStarted) { 'review_required' } elseif ($script:Changes.Count) { 'partial' } else { 'failed' }
                $runError = 'One or more actions failed; review actionResults.'
            }
        }
    }
} catch {
    $runStatus = if ($script:MutationStarted) { 'review_required' } elseif ($script:Changes.Count) { 'partial' } else { 'failed' }
    $runError = "Fehler bei '$($script:CurrentAction)': $($_.Exception.Message)"
    Add-RunLog 'Run failed' 'failed' $runError
    if ($job.PSObject.Properties['actions']) {
        foreach ($action in $job.actions) {
            if (@($script:ActionResults | Where-Object { $_.action -eq $action.type }).Count -eq 0) { $script:ActionResults.Add([pscustomobject]@{ action = $action.type; status = 'failed'; error = $runError }) }
        }
    }
} finally {
    if ($CredentialPath) { Remove-Item -LiteralPath $CredentialPath -Force -ErrorAction SilentlyContinue }
    if ($HelpdeskCredentialPath) { Remove-Item -LiteralPath $HelpdeskCredentialPath -Force -ErrorAction SilentlyContinue }
    if ($InitialPasswordPath) { Remove-Item -LiteralPath $InitialPasswordPath -Force -ErrorAction SilentlyContinue }
    $adCredential = $null
    $helpdeskCredential = $null
    $initialPassword = $null
    $completedAt = Get-Date
    if (@($script:ActionResults | Where-Object { $_.status -eq 'review_required' }).Count -gt 0) { $runStatus = 'review_required' }
    [string[]]$automationTaskIds = @()
    if ($job.PSObject.Properties['automationTaskIds']) {
        $automationTaskIds = @($job.automationTaskIds | ForEach-Object { [string]$_ } | Where-Object { $_ })
    }
    $result = [pscustomobject]@{
        schemaVersion = 1; runId = $runId; jobId = $(if ($job.PSObject.Properties['jobId']) { [string]$job.jobId } else { [IO.Path]::GetFileNameWithoutExtension($resolvedJobPath) }); employeeId = $(if ($job.PSObject.Properties['person'] -and $null -ne $job.person -and $job.person.PSObject.Properties['employeeId']) { [string]$job.person.employeeId } else { '' })
        operation = $(if ($operation -in @('execute', 'rollback', 'reference_check')) { $operation } else { 'execute' }); mode = $(if ($Mode -in @('WhatIf', 'Execute')) { $Mode } else { 'WhatIf' }); status = $runStatus; relatedRunId = if ($operation -eq 'rollback' -and $job.PSObject.Properties['originalRun'] -and $null -ne $job.originalRun -and $job.originalRun.PSObject.Properties['id']) { [string]$job.originalRun.id } elseif ($job.PSObject.Properties['retryOfRunId']) { [string]$job.retryOfRunId } else { $null }
        startedAt = $startedAt.ToString('o'); completedAt = $completedAt.ToString('o'); error = $runError
        automationTaskIds = [string[]]$automationTaskIds; changes = $script:Changes; log = $script:RunLog; actionResults = $script:ActionResults
        referenceLookup = $referenceLookup
        directoryIdentity = $(if ($existingUser) { [pscustomobject]@{ objectGuid = [string]$existingUser.ObjectGUID; samAccountName = [string]$existingUser.SamAccountName; userPrincipalName = [string]$existingUser.UserPrincipalName; personnelNumber = [string]$job.person.personnelNumber } } else { $null })
        computerName = $env:COMPUTERNAME; operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    }
    $resultPath = [IO.Path]::ChangeExtension($resolvedJobPath, '.result.json')
    $resultJson = $result | ConvertTo-Json -Depth 12
    $resultJson | Set-Content -LiteralPath "$resultPath.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$resultPath.tmp" -Destination $resultPath -Force
    Remove-Item -LiteralPath $progressPath -Force -ErrorAction SilentlyContinue
    Write-Host "Finished with status $runStatus. Result: $resultPath" -ForegroundColor $(if ($runStatus -eq 'completed') { 'Green' } else { 'Yellow' })
}

if ($runStatus -in @('partial', 'failed', 'review_required')) { exit 1 }
