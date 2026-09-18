[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$JobPath,
    [string]$CredentialPath = '',
    [ValidateSet('Job', 'WhatIf', 'Execute')]
    [string]$Mode = 'Job'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$resolvedJobPath = (Resolve-Path -LiteralPath $JobPath).Path
$job = Get-Content -LiteralPath $resolvedJobPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($job.schemaVersion -ne 1) { throw 'Unsupported job schema. Expected schemaVersion 1.' }
if ($Mode -eq 'Job') { $Mode = if ($job.requestedMode -eq 'Execute') { 'Execute' } else { 'WhatIf' } }
$operation = if ($job.PSObject.Properties['operation']) { [string]$job.operation } else { 'execute' }
if ($operation -notin @('execute', 'rollback', 'reference_check')) { throw "Unsupported operation: $operation" }
if ($job.directory.domain -ne 'kauth.local') { throw 'This pilot accepts only the kauth.local domain.' }

$script:RunLog = [System.Collections.Generic.List[object]]::new()
$script:Changes = [System.Collections.Generic.List[object]]::new()
$startedAt = Get-Date
$runId = if ($job.PSObject.Properties['runId']) { [string]$job.runId } else { [string]$job.jobId }
$runStatus = 'completed'
$runError = ''
$referenceLookup = $null
$adCredential = $null

function Add-RunLog {
    param([string]$Action, [string]$State, [string]$Message)
    $script:RunLog.Add([pscustomobject]@{ time = (Get-Date).ToString('o'); action = $Action; state = $State; message = $Message })
}

function Add-Change {
    param([string]$Action, [string]$ResourceType, [string]$ResourceId, [string]$Relation, $BeforeValue, $AfterValue, [string]$RollbackAction, [string]$State = '')
    if (-not $State) { $State = if ($Mode -eq 'WhatIf') { 'simulated' } else { 'completed' } }
    $script:Changes.Add([pscustomobject]@{
        id = "change-$([guid]::NewGuid().ToString('N'))"; action = $Action; resourceType = $ResourceType; resourceId = $ResourceId
        relation = $Relation; beforeValue = $BeforeValue; afterValue = $AfterValue; rollbackAction = $RollbackAction; status = $State
    })
}

function Invoke-ApprovedAction {
    param([string]$Action, [string]$Target, [scriptblock]$Operation)
    if ($Mode -eq 'WhatIf') { Add-RunLog $Action 'simulated' "Would change: $Target"; return $true }
    $null = & $Operation
    Add-RunLog $Action 'completed' $Target
    return $true
}

function Get-ParentDn { param([string]$DistinguishedName); return $DistinguishedName -replace '^[A-Z]{2}=(?:\\.|[^,])+,', '' }
function Read-StoredValue { param($Value); if ($null -eq $Value -or $Value -eq '') { return $null }; try { return ($Value | ConvertFrom-Json) } catch { return $Value } }
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
Write-Host "Job: $($job.jobId)"
Write-Host 'The AD credential is loaded from a one-time DPAPI file and is not written to the result file.' -ForegroundColor DarkGray

try {
    if ($CredentialPath) {
        try {
            $adCredential = Import-Clixml -LiteralPath $CredentialPath
        } finally {
            Remove-Item -LiteralPath $CredentialPath -Force -ErrorAction SilentlyContinue
        }
        if ($adCredential -isnot [Management.Automation.PSCredential]) { throw 'The supplied AD credential could not be read.' }
    } else { throw 'No AD credential was supplied. Interactive prompts are disabled for gateway jobs.' }
    Import-Module ActiveDirectory -ErrorAction Stop
    $null = Get-ADDomain -Identity $job.directory.domain -Server $job.directory.domain -Credential $adCredential
    $adArgs = @{ Server = $job.directory.domain; Credential = $adCredential; ErrorAction = 'Stop' }
    Add-RunLog 'ValidateAdConnection' 'completed' $job.directory.domain

    if ($operation -eq 'reference_check') {
        $query = [string]$job.directory.referenceUser.query
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
            $rollbackAction = [string]$change.rollbackAction
            $resourceId = [string]$change.resourceId
            switch ($rollbackAction) {
                'Remove-ADUser' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Remove-ADUser -Identity $resourceId -Confirm:$false @adArgs }) { Add-Change $rollbackAction 'AD-Benutzer' $resourceId 'Benutzerkonto der Mitarbeiterakte' $change.afterValue $null 'manual' }
                }
                'Remove-ADComputer' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Remove-ADComputer -Identity $resourceId -Confirm:$false @adArgs }) { Add-Change $rollbackAction 'AD-Computer' $resourceId 'Geraet der Mitarbeiterakte' $change.afterValue $null 'manual' }
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
                    if (Invoke-ApprovedAction $rollbackAction $resourceId $restoreDescription) { Add-Change 'Computerbeschreibung wiederhergestellt' 'AD-Computer' $resourceId 'Nur Beschreibung; alle anderen Eigenschaften unveraendert' $change.afterValue $originalDescription 'manual' }
                }
                'Remove-ADGroupMember' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Remove-ADGroupMember -Identity $resourceId -Members $job.directory.samAccountName -Confirm:$false @adArgs }) { Add-Change $rollbackAction 'AD-Gruppe' $resourceId "Mitglied: $($job.directory.samAccountName)" $true $false 'Add-ADGroupMember' }
                }
                'Add-ADGroupMember' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Add-ADGroupMember -Identity $resourceId -Members $job.directory.samAccountName @adArgs }) { Add-Change $rollbackAction 'AD-Gruppe' $resourceId "Mitglied: $($job.directory.samAccountName)" $false $true 'Remove-ADGroupMember' }
                }
                'Enable-ADAccount' {
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Enable-ADAccount -Identity $resourceId @adArgs }) { Add-Change $rollbackAction 'AD-Benutzer' $resourceId 'Kontostatus' $false $true 'Disable-ADAccount' }
                }
                'Move-ADObject' {
                    $originalOu = [string](Read-StoredValue $change.beforeValue)
                    if (-not $originalOu) { throw "Original OU missing for $resourceId" }
                    if (Invoke-ApprovedAction $rollbackAction $resourceId { Move-ADObject -Identity $resourceId -TargetPath $originalOu @adArgs }) { Add-Change $rollbackAction 'AD-Benutzer' $resourceId 'Organisationseinheit' $change.afterValue $originalOu 'Move-ADObject' }
                }
                default { Add-RunLog 'Rollback manual' 'skipped' "$($change.action): $resourceId" }
            }
        }
    } else {
        if ($job.directory.samAccountName -notmatch '^[a-z0-9.-]+$') { throw 'Invalid sAMAccountName in job.' }
        if ($Mode -eq 'Execute' -and $job.lifecycleType -ne 'offboarding' -and $job.directory.targetOu -eq 'REVIEW_REQUIRED') { throw 'Select and approve a target OU in the job before running the agent.' }
        if ($Mode -eq 'Execute' -and @($job.directory.computers | Where-Object { $_.mode -ne 'existing' -and ($_.prefix -eq 'REVIEW_REQUIRED' -or $_.targetOu -eq 'REVIEW_REQUIRED') }).Count) { throw 'Select and approve the location and computer OU before running the agent.' }

        $existingUser = Get-ADUser -Filter "SamAccountName -eq '$($job.directory.samAccountName)'" @adArgs -Properties MemberOf,Mail,Enabled,DistinguishedName
        $assignedGroups = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        if ($existingUser) { foreach ($groupDn in @($existingUser.MemberOf)) { $null = $assignedGroups.Add([string]$groupDn) } }
        $referenceUser = $null
        $resolvedTargetOu = [string]$job.directory.targetOu
        if ($job.directory.referenceUser) {
            $referenceUsers = @(Find-ReferenceUsers $job.directory.referenceUser $adArgs)
            if ($referenceUsers.Count -ne 1) { throw "Reference user '$($job.directory.referenceUser.displayName)' is not unique. Found: $($referenceUsers.Count)." }
            $referenceUser = $referenceUsers[0]
            if ($resolvedTargetOu -eq 'REFERENCE_USER_OU') { $resolvedTargetOu = Get-ParentDn $referenceUser.DistinguishedName }
        }

        foreach ($action in $job.actions) {
            $actionType = [string]$action.type
            switch -Wildcard ($actionType) {
                'CreateAdUser' {
                    if ($existingUser) { Add-RunLog $actionType 'skipped' 'Account already exists.'; break }
                    $newUserArgs = @{
                        Name = $job.person.displayName; GivenName = $job.person.firstName; Surname = $job.person.lastName; DisplayName = $job.person.displayName
                        SamAccountName = $job.directory.samAccountName; UserPrincipalName = $job.directory.userPrincipalName; EmailAddress = $job.directory.mail
                        EmployeeNumber = $job.person.personnelNumber; Department = $job.person.department; Description = $job.directory.description
                        Title = $job.directory.title; Company = $job.person.company; Path = $resolvedTargetOu; Enabled = $false
                    }
                    $changed = Invoke-ApprovedAction 'Create disabled AD user' $job.directory.userPrincipalName { New-ADUser @newUserArgs @adArgs }
                    if ($Mode -eq 'Execute' -and $changed) {
                        $existingUser = Get-ADUser -Identity $job.directory.samAccountName @adArgs -Properties MemberOf,Mail,Enabled,DistinguishedName
                        Add-Change 'Benutzer angelegt' 'AD-Benutzer' $existingUser.SamAccountName 'Primaeres Konto der Mitarbeiterakte' $null $existingUser.DistinguishedName 'Remove-ADUser'
                    } elseif ($Mode -eq 'WhatIf') { Add-Change 'Benutzer anlegen' 'AD-Benutzer' $job.directory.samAccountName 'Primaeres Konto der Mitarbeiterakte' $null $resolvedTargetOu 'manual' 'simulated' }
                }
                'CopyGroupsFromReference' {
                    if (-not $referenceUser) { throw 'Reference user action exists without a unique reference user.' }
                    foreach ($groupDn in @($referenceUser.MemberOf)) {
                        $alreadyMember = $assignedGroups.Contains([string]$groupDn)
                        if ($alreadyMember) { Add-RunLog 'Copy reference group membership' 'skipped' "$groupDn already assigned"; continue }
                        if (Invoke-ApprovedAction 'Copy reference group membership' $groupDn { Add-ADGroupMember -Identity $groupDn -Members $job.directory.samAccountName @adArgs }) { $null = $assignedGroups.Add([string]$groupDn); Add-Change 'Gruppenmitgliedschaft kopiert' 'AD-Gruppe' $groupDn "Referenz: $($referenceUser.SamAccountName) -> Mitglied: $($job.directory.samAccountName)" $false $true 'Remove-ADGroupMember' }
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
                    if ($prefix -notmatch '^[A-Z]{2}-CL(NB|WS)$') { throw "Invalid computer prefix: $prefix" }
                    $targetOu = [string]$computerPlan.targetOu
                    $null = Get-ADOrganizationalUnit -Identity $targetOu @adArgs
                    $numbers = Get-ADComputer -Filter "Name -like '$prefix*'" @adArgs | ForEach-Object { if ($_.Name -match ('^' + [regex]::Escape($prefix) + '(\d+)$')) { [int]$Matches[1] } }
                    $nextNumber = if ($numbers) { ($numbers | Measure-Object -Maximum).Maximum + 1 } else { 1 }
                    do { $computerName = $prefix + $nextNumber.ToString('000'); $computerExists = Get-ADComputer -Filter "Name -eq '$computerName'" @adArgs; if ($computerExists) { $nextNumber++ } } while ($computerExists)
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
                'CreateHelpdeskTicket' {
                    if ($Mode -eq 'WhatIf') { Add-RunLog $actionType 'simulated' $job.helpdesk.subject; Add-Change 'Helpdesk-Ticket erstellen' 'Helpdesk-Ticket' $job.helpdesk.subject "Vorgang fuer $($job.person.displayName)" $null $job.helpdesk.text 'manual' 'simulated'; break }
                    $body = @{ text = $job.helpdesk.text; htmlContent = $false; ticketFields = @{ subject = $job.helpdesk.subject }; actionArguments = @{} } | ConvertTo-Json -Depth 8
                    $ticket = Invoke-RestMethod -Uri "$($job.helpdesk.baseUrl.TrimEnd('/'))/api/ticket/create" -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 60
                    $ticketId = if ($ticket.id) { [string]$ticket.id } elseif ($ticket.ticketId) { [string]$ticket.ticketId } else { $job.helpdesk.subject }
                    Add-RunLog $actionType 'completed' "Ticket: $ticketId"
                    Add-Change 'Helpdesk-Ticket erstellt' 'Helpdesk-Ticket' $ticketId "Vorgang fuer $($job.person.displayName)" $null $job.helpdesk.subject 'manual'
                }
                default { Add-RunLog $actionType 'skipped' 'Unknown action type.' }
            }
        }
    }
} catch {
    $runStatus = if ($script:Changes.Count) { 'partial' } else { 'failed' }
    $runError = $_.Exception.Message
    Add-RunLog 'Run failed' 'failed' $runError
} finally {
    if ($CredentialPath) { Remove-Item -LiteralPath $CredentialPath -Force -ErrorAction SilentlyContinue }
    $adCredential = $null
    $completedAt = Get-Date
    [string[]]$automationTaskIds = @()
    if ($job.PSObject.Properties['automationTaskIds']) {
        $automationTaskIds = @($job.automationTaskIds | ForEach-Object { [string]$_ } | Where-Object { $_ })
    }
    $result = [pscustomobject]@{
        schemaVersion = 1; runId = $runId; jobId = [string]$job.jobId; employeeId = [string]$job.person.employeeId
        operation = $operation; mode = $Mode; status = $runStatus; relatedRunId = if ($operation -eq 'rollback') { [string]$job.originalRun.id } else { $null }
        startedAt = $startedAt.ToString('o'); completedAt = $completedAt.ToString('o'); error = $runError
        automationTaskIds = [string[]]$automationTaskIds; changes = $script:Changes; log = $script:RunLog
        referenceLookup = $referenceLookup
        computerName = $env:COMPUTERNAME; operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    }
    $resultPath = [IO.Path]::ChangeExtension($resolvedJobPath, '.result.json')
    $resultJson = $result | ConvertTo-Json -Depth 12
    $resultJson | Set-Content -LiteralPath $resultPath -Encoding UTF8
    if ($job.PSObject.Properties['callbackUrl'] -and $job.callbackUrl) {
        $callbackHeaders = @{ 'content-type' = 'application/json' }
        if ($job.PSObject.Properties['callbackToken'] -and $job.callbackToken) { $callbackHeaders.authorization = "Bearer $($job.callbackToken)" }
        try { Invoke-RestMethod -Uri $job.callbackUrl -Method Post -Headers $callbackHeaders -Body $resultJson | Out-Null } catch { Write-Warning "Result callback failed: $($_.Exception.Message)" }
    }
    Write-Host "Finished with status $runStatus. Result: $resultPath" -ForegroundColor $(if ($runStatus -eq 'completed') { 'Green' } else { 'Yellow' })
}

if ($runStatus -in @('partial', 'failed')) { exit 1 }
