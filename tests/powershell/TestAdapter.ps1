# Isolated, persistent local substitutes. Never imports directory/cloud modules.
if ($env:IT_LIFECYCLE_TEST_MODE -ne '1' -or -not $env:IT_LIFECYCLE_TEST_STATE) { throw 'Isolated adapter configuration required.' }
$script:Adapter = Get-Content -LiteralPath $env:IT_LIFECYCLE_TEST_STATE -Raw -Encoding UTF8 | ConvertFrom-Json
function Save-Adapter { $script:Adapter | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $env:IT_LIFECYCLE_TEST_STATE -Encoding UTF8 }
function Mutation { param([string]$Name)
    if ($env:IT_LIFECYCLE_TEST_FAIL -eq $Name) { throw "Injected $Name failure" }
    $script:Adapter.mutations = [int]$script:Adapter.mutations + 1
}
function Find-Object { param($Identity)
    $key = if ($Identity -is [string] -or $Identity -is [guid]) { [string]$Identity } else { [string]$Identity.ObjectGUID }
    $objects = @($script:Adapter.users) + @($script:Adapter.computers) + @($script:Adapter.groups)
    $found = @($objects | Where-Object { $_.ObjectGUID -eq $key -or $_.SamAccountName -eq $key -or $_.DistinguishedName -eq $key -or $_.Name -eq $key })
    if ($found.Count -ne 1) { throw "Object not found or ambiguous: $key" }; return $found[0]
}
function Get-ADDomain { [CmdletBinding()]param($Identity,$Server,$Credential); if ($env:IT_LIFECYCLE_TEST_FORBID_AD -eq '1') { throw 'AD must not be touched' }; return @{ Name = 'kauth.local' } }
function Get-ADObject { [CmdletBinding()]param($Identity,$Properties,$Server,$Credential); return Find-Object $Identity }
function Get-ADUser { [CmdletBinding()]param($Identity,$Filter,$Properties,$Server,$Credential)
    if ($env:IT_LIFECYCLE_TEST_FORBID_AD -eq '1') { throw 'AD must not be touched' }
    if ($Identity) { return Find-Object $Identity }
    if ($Filter -match "EmployeeNumber -eq '([^']+)'" ) { $number = $matches[1]; return @($script:Adapter.users | Where-Object { $_.EmployeeNumber -eq $number }) }
    if ($Filter -match "SamAccountName -eq '([^']+)'" ) { return @($script:Adapter.users | Where-Object { $_.SamAccountName -eq $matches[1] }) }
    return @()
}
function Get-ADComputer { [CmdletBinding()]param($Identity,$Filter,$Properties,$Server,$Credential)
    if ($Identity) { return Find-Object $Identity }
    if ($Filter -match "Name -eq '([^']+)'" ) { $name = $matches[1]; return @($script:Adapter.computers | Where-Object { $_.Name -eq $name }) }
    return @($script:Adapter.computers)
}
function Get-ADGroup { [CmdletBinding()]param($Identity,$Properties,$Server,$Credential); return Find-Object $Identity }
function Get-ADOrganizationalUnit { [CmdletBinding()]param($Identity,$Server,$Credential); return @{ DistinguishedName = $Identity } }
function New-ADUser { [CmdletBinding()]param($Name,$GivenName,$Surname,$DisplayName,$SamAccountName,$UserPrincipalName,$EmailAddress,$EmployeeNumber,$Department,$Description,$Title,$Company,$Path,$Enabled,$AccountPassword,$ChangePasswordAtLogon,$Server,$Credential)
    Mutation 'New-ADUser'
    $user = [pscustomobject]@{ Name=$Name; GivenName=$GivenName; Surname=$Surname; DisplayName=$DisplayName; SamAccountName=$SamAccountName; UserPrincipalName=$UserPrincipalName; Mail=$EmailAddress; EmployeeNumber=$EmployeeNumber; Department=$Department; Description=$Description; Title=$Title; Company=$Company; DistinguishedName=("CN=" + ([string]$Name).Replace(",", "\,") + ",$Path"); Enabled=$Enabled; ObjectGUID=[guid]::NewGuid().ToString(); MemberOf=@(); ManagedBy='' }
    $script:Adapter.users = @($script:Adapter.users) + @($user); Save-Adapter
}
function New-ADComputer { [CmdletBinding()]param($Name,$SamAccountName,$Path,$Description,$ManagedBy,$Enabled,$Server,$Credential)
    Mutation 'New-ADComputer'
    $script:Adapter.computers = @($script:Adapter.computers) + @([pscustomobject]@{Name=$Name; SamAccountName=$SamAccountName; DistinguishedName=("CN=" + ([string]$Name).Replace(",", "\,") + ",$Path"); Description=$Description; ManagedBy=$ManagedBy; Enabled=$Enabled; ObjectGUID=[guid]::NewGuid().ToString(); MemberOf=@()}); Save-Adapter
}
function Set-ADComputer { [CmdletBinding()]param($Identity,$Description,$Clear,$Server,$Credential)
    Mutation 'Set-ADComputer'; $object=Find-Object $Identity; $object.Description=if($Clear){''}else{$Description}; Save-Adapter
}
function Set-ADUser { [CmdletBinding()]param($Identity,$DisplayName,$Title,$Description,$Department,$Clear,$Server,$Credential)
    Mutation 'Set-ADUser'; $object=Find-Object $Identity
    foreach($name in @('DisplayName','Title','Description','Department')) { if($PSBoundParameters.ContainsKey($name)){$object.$name=$PSBoundParameters[$name]} }; Save-Adapter
    foreach($name in @($Clear)) { if ($name) { $object.$name = '' } }; Save-Adapter
}
function Add-ADGroupMember { [CmdletBinding()]param($Identity,$Members,$Server,$Credential)
    Mutation 'Add-ADGroupMember'; $group=Find-Object $Identity; $user=Find-Object $Members; $user.MemberOf=@($user.MemberOf)+@($group.DistinguishedName); Save-Adapter
}
function Remove-ADGroupMember { [CmdletBinding(SupportsShouldProcess=$true)]param($Identity,$Members,$Server,$Credential)
    Mutation 'Remove-ADGroupMember'; $group=Find-Object $Identity; $user=Find-Object $Members; $user.MemberOf=@($user.MemberOf|Where-Object{$_ -ne $group.DistinguishedName}); Save-Adapter
}
function Disable-ADAccount { [CmdletBinding()]param($Identity,$Server,$Credential); Mutation 'Disable-ADAccount'; (Find-Object $Identity).Enabled=$false; Save-Adapter }
function Enable-ADAccount { [CmdletBinding()]param($Identity,$Server,$Credential); Mutation 'Enable-ADAccount'; (Find-Object $Identity).Enabled=$true; Save-Adapter }
function Move-ADObject { [CmdletBinding()]param($Identity,$TargetPath,$Server,$Credential); Mutation 'Move-ADObject'; $o=Find-Object $Identity; $o.DistinguishedName=($o.DistinguishedName -replace ',OU=.*$', '')+','+$TargetPath; Save-Adapter }
function Remove-ADUser { [CmdletBinding(SupportsShouldProcess=$true)]param($Identity,$Server,$Credential); Mutation 'Remove-ADUser'; $o=Find-Object $Identity; $script:Adapter.users=@($script:Adapter.users|Where-Object{$_.ObjectGUID -ne $o.ObjectGUID}); Save-Adapter }
function Remove-ADComputer { [CmdletBinding(SupportsShouldProcess=$true)]param($Identity,$Server,$Credential); Mutation 'Remove-ADComputer'; $o=Find-Object $Identity; $script:Adapter.computers=@($script:Adapter.computers|Where-Object{$_.ObjectGUID -ne $o.ObjectGUID}); Save-Adapter }
function Connect-MgGraph { [CmdletBinding()]param($TenantId,$ClientId,$CertificateThumbprint,[switch]$NoWelcome) }
function Disconnect-MgGraph { [CmdletBinding()]param() }
function Invoke-Command { [CmdletBinding()]param($ComputerName,$Credential,$ScriptBlock); Mutation 'ADSync'; Save-Adapter; if($env:IT_LIFECYCLE_TEST_DELAY_SECONDS){[Threading.Thread]::Sleep([int]$env:IT_LIFECYCLE_TEST_DELAY_SECONDS*1000)} }
function Get-MgUser { [CmdletBinding()]param($UserId,$Property); return $script:Adapter.cloudUser }
function Get-MgSubscribedSku { [CmdletBinding()]param([switch]$All); return $script:Adapter.sku }
function Update-MgUser { [CmdletBinding()]param($UserId,$UsageLocation); Mutation 'Update-MgUser'; $script:Adapter.cloudUser.UsageLocation=$UsageLocation; Save-Adapter }
function Set-MgUserLicense { [CmdletBinding()]param($UserId,$AddLicenses,$RemoveLicenses); Mutation 'Set-MgUserLicense'; $script:Adapter.cloudUser.AssignedLicenses=@([pscustomobject]@{SkuId=$AddLicenses[0].SkuId}); Save-Adapter }
function Invoke-TestMailboxCheck { param($UserPrincipalName); if($env:IT_LIFECYCLE_TEST_FAIL -eq 'Mailbox'){throw 'Mailbox timeout'}; return '{"mailboxId":"00000000-0000-0000-0000-000000000099"}' }
function Invoke-RestMethod { [CmdletBinding()]param($Uri,$Method,$Credential,$ContentType,$Body,$TimeoutSec)
    Mutation 'Helpdesk'; $script:Adapter.tickets=@($script:Adapter.tickets)+@('test-ticket-1'); Save-Adapter; if($env:IT_LIFECYCLE_TEST_FAIL -eq 'HelpdeskTimeout'){throw 'Response lost after creation'}; return [pscustomobject]@{id='test-ticket-1'}
}
