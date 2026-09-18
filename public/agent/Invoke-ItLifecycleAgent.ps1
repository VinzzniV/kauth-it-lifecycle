[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$JobPath,

    [ValidateSet('WhatIf', 'Execute')]
    [string]$Mode = 'WhatIf'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Add-RunLog {
    param([string]$Action, [string]$State, [string]$Message)
    $script:RunLog.Add([pscustomobject]@{
        time = (Get-Date).ToString('o')
        action = $Action
        state = $State
        message = $Message
    })
}

function Invoke-ApprovedAction {
    param([string]$Action, [string]$Target, [scriptblock]$Operation)
    if ($Mode -eq 'WhatIf') {
        Add-RunLog $Action 'simulated' "Would change: $Target"
        return
    }
    if ($PSCmdlet.ShouldProcess($Target, $Action)) {
        & $Operation
        Add-RunLog $Action 'completed' $Target
    } else {
        Add-RunLog $Action 'skipped' $Target
    }
}

$resolvedJobPath = (Resolve-Path -LiteralPath $JobPath).Path
$job = Get-Content -LiteralPath $resolvedJobPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($job.schemaVersion -ne 1) { throw 'Unsupported job schema. Expected schemaVersion 1.' }
if ($job.directory.domain -ne 'kauth.local') { throw 'This pilot accepts only the kauth.local domain.' }
if ($job.directory.samAccountName -notmatch '^[a-z0-9.-]+$') { throw 'Invalid sAMAccountName in job.' }
if ($Mode -eq 'Execute' -and $job.lifecycleType -ne 'offboarding' -and $job.directory.targetOu -eq 'REVIEW_REQUIRED') {
    throw 'Select and approve a target OU in the job before running the agent.'
}
if ($Mode -eq 'Execute' -and @($job.directory.computers | Where-Object { $_.prefix -eq 'REVIEW_REQUIRED' -or $_.targetOu -eq 'REVIEW_REQUIRED' }).Count) {
    throw 'Select and approve the location and computer OU before running the agent.'
}

$script:RunLog = [System.Collections.Generic.List[object]]::new()
$startedAt = Get-Date
Write-Host "IT Lifecycle agent - $Mode" -ForegroundColor Cyan
Write-Host "Job: $($job.jobId) | User: $($job.directory.samAccountName)"
Write-Host 'Credentials are requested locally, kept in memory, and are not written to the result file.' -ForegroundColor DarkGray

Import-Module ActiveDirectory -ErrorAction Stop
$adCredential = Get-Credential -Message 'Enter the delegated AD test account (Domain Admin is not recommended).'
$null = Get-ADDomain -Identity $job.directory.domain -Server $job.directory.domain -Credential $adCredential
Add-RunLog 'ValidateAdConnection' 'completed' $job.directory.domain

$adArgs = @{ Server = $job.directory.domain; Credential = $adCredential; ErrorAction = 'Stop' }
$existingUser = Get-ADUser -Filter "SamAccountName -eq '$($job.directory.samAccountName)'" @adArgs -Properties MemberOf,Mail,Enabled,DistinguishedName
$referenceUser = $null
$resolvedTargetOu = [string]$job.directory.targetOu
if ($job.directory.referenceUser) {
    $surname = ([string]$job.directory.referenceUser.surname).Replace("'", "''")
    $initial = ([string]$job.directory.referenceUser.givenNameInitial).Replace("'", "''")
    $referenceUsers = @(Get-ADUser -Filter "Surname -eq '$surname' -and GivenName -like '$initial*'" @adArgs -Properties MemberOf,DistinguishedName)
    if ($referenceUsers.Count -ne 1) { throw "Reference user '$($job.directory.referenceUser.displayName)' is not unique. Found: $($referenceUsers.Count)." }
    $referenceUser = $referenceUsers[0]
    if ($resolvedTargetOu -eq 'REFERENCE_USER_OU') {
        $resolvedTargetOu = $referenceUser.DistinguishedName -replace '^CN=(?:\\.|[^,])+,', ''
    }
}

foreach ($action in $job.actions) {
    $actionType = [string]$action.type
    switch -Wildcard ($actionType) {
        'CreateAdUser' {
            if ($existingUser) { Add-RunLog $actionType 'skipped' 'Account already exists.'; break }
            $newUserArgs = @{
                Name = $job.person.displayName
                GivenName = $job.person.firstName
                Surname = $job.person.lastName
                DisplayName = $job.person.displayName
                SamAccountName = $job.directory.samAccountName
                UserPrincipalName = $job.directory.userPrincipalName
                EmailAddress = $job.directory.mail
                EmployeeNumber = $job.person.personnelNumber
                Department = $job.person.department
                Description = $job.directory.description
                Title = $job.directory.title
                Company = $job.person.company
                Path = $resolvedTargetOu
                Enabled = $false
            }
            Invoke-ApprovedAction 'Create disabled AD user' $job.directory.userPrincipalName { New-ADUser @newUserArgs @adArgs }
            if ($Mode -eq 'Execute') { $existingUser = Get-ADUser -Identity $job.directory.samAccountName @adArgs -Properties MemberOf,Mail,Enabled,DistinguishedName }
        }
        'CopyGroupsFromReference' {
            if (-not $referenceUser) { throw 'Reference user action exists without a unique reference user.' }
            foreach ($groupDn in @($referenceUser.MemberOf)) {
                Invoke-ApprovedAction 'Copy reference group membership' $groupDn { Add-ADGroupMember -Identity $groupDn -Members $job.directory.samAccountName @adArgs }
            }
        }
        'AddGroup:*' {
            $groupName = $actionType.Substring(9)
            $null = Get-ADGroup -Identity $groupName @adArgs
            Invoke-ApprovedAction 'Add AD group membership' $groupName { Add-ADGroupMember -Identity $groupName -Members $job.directory.samAccountName @adArgs }
        }
        'SnapshotAdAccount' {
            if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
            Add-RunLog $actionType 'completed' "Enabled=$($existingUser.Enabled); Groups=$($existingUser.MemberOf.Count); DN=$($existingUser.DistinguishedName)"
        }
        'DisableAdUser' {
            if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
            Invoke-ApprovedAction 'Disable AD account' $job.directory.samAccountName { Disable-ADAccount -Identity $existingUser @adArgs }
        }
        'RemoveGroupMemberships' {
            if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
            foreach ($groupDn in @($existingUser.MemberOf)) {
                Invoke-ApprovedAction 'Remove AD group membership' $groupDn { Remove-ADGroupMember -Identity $groupDn -Members $existingUser -Confirm:$false @adArgs }
            }
        }
        'MoveAdUser' {
            if (-not $existingUser) { throw "AD account $($job.directory.samAccountName) was not found." }
            $disabledOu = [string]$job.directory.disabledOu
            $null = Get-ADOrganizationalUnit -Identity $disabledOu @adArgs
            Invoke-ApprovedAction 'Move AD account' $disabledOu { Move-ADObject -Identity $existingUser.DistinguishedName -TargetPath $disabledOu @adArgs }
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
            do {
                $computerName = $prefix + $nextNumber.ToString('000')
                $computerExists = Get-ADComputer -Filter "Name -eq '$computerName'" @adArgs
                if ($computerExists) { $nextNumber++ }
            } while ($computerExists)
            $managedBy = if ($existingUser) { $existingUser.DistinguishedName } else { $job.directory.samAccountName }
            $computerArgs = @{ Name = $computerName; SamAccountName = "$computerName`$"; Path = $targetOu; Description = $computerPlan.description; ManagedBy = $managedBy; Enabled = $true }
            Invoke-ApprovedAction "Create AD computer ($computerType)" $computerName { New-ADComputer @computerArgs @adArgs }
        }
        'CreateHelpdeskTicket' {
            if ($Mode -eq 'WhatIf') { Add-RunLog $actionType 'simulated' $job.helpdesk.subject; break }
            if (-not $PSCmdlet.ShouldProcess($job.helpdesk.baseUrl, "Create HelpDesk ticket '$($job.helpdesk.subject)'")) { Add-RunLog $actionType 'skipped' $job.helpdesk.subject; break }
            $helpdeskCredential = Get-Credential -Message 'Enter the i-net HelpDesk API account.'
            $plainPassword = $helpdeskCredential.GetNetworkCredential().Password
            try {
                $basicBytes = [Text.Encoding]::ASCII.GetBytes("$($helpdeskCredential.UserName):$plainPassword")
                $headers = @{ Authorization = "Basic $([Convert]::ToBase64String($basicBytes))" }
                $body = @{ text = $job.helpdesk.text; htmlContent = $false; ticketFields = @{ subject = $job.helpdesk.subject }; actionArguments = @{} } | ConvertTo-Json -Depth 8
                $ticket = Invoke-RestMethod -Uri "$($job.helpdesk.baseUrl.TrimEnd('/'))/api/ticket/create" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body
                Add-RunLog $actionType 'completed' "Ticket response received: $($ticket | ConvertTo-Json -Compress -Depth 3)"
            } finally {
                $plainPassword = $null
                $basicBytes = $null
                $headers = $null
            }
        }
        default { Add-RunLog $actionType 'skipped' 'Unknown action type.' }
    }
}

$resultPath = [IO.Path]::ChangeExtension($resolvedJobPath, '.result.json')
[pscustomobject]@{
    schemaVersion = 1
    jobId = $job.jobId
    mode = $Mode
    startedAt = $startedAt.ToString('o')
    completedAt = (Get-Date).ToString('o')
    computerName = $env:COMPUTERNAME
    operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    log = $script:RunLog
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8

Write-Host "Finished. Result: $resultPath" -ForegroundColor Green
