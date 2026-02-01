$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.audit.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$Name = 'Runlane Audit Operator'
$WorkspaceName = "Runlane Audited Workspace $Timestamp"
$ApiKeyName = "Audited API key $Timestamp"

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)] [string] $Method,
    [Parameter(Mandatory = $true)] [string] $Uri,
    [object] $Body = $null,
    [hashtable] $Headers = @{}
  )

  $Parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $Parameters.Body = ($Body | ConvertTo-Json -Depth 16 -Compress)
    $Parameters.ContentType = 'application/json'
  }

  Invoke-RestMethod @Parameters
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)] [AllowNull()] [object] $Actual,
    [Parameter(Mandatory = $true)] [AllowNull()] [object] $Expected,
    [Parameter(Mandatory = $true)] [string] $Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected' but received '$Actual'."
  }
}

function Assert-ContainsAction {
  param(
    [Parameter(Mandatory = $true)] [object[]] $Items,
    [Parameter(Mandatory = $true)] [string] $Action
  )

  $Matches = @($Items | Where-Object { $_.action -eq $Action })

  if ($Matches.Count -lt 1) {
    throw "Audit action '$Action' was not returned."
  }
}

function Invoke-ExpectedFailure {
  param(
    [Parameter(Mandatory = $true)] [scriptblock] $Operation,
    [Parameter(Mandatory = $true)] [int] $StatusCode
  )

  try {
    & $Operation | Out-Null
  } catch {
    $Response = $_.Exception.Response

    if ($null -eq $Response) {
      throw
    }

    if ([int] $Response.StatusCode -ne $StatusCode) {
      throw "Expected HTTP $StatusCode but received $([int] $Response.StatusCode)."
    }

    return
  }

  throw "Expected request failure with HTTP $StatusCode."
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Headers @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
} -Body @{
  email = $Email
  password = $Password
  name = $Name
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Headers @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
} -Body @{
  email = $Email
  password = $Password
}

$Refresh = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/refresh" -Headers @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
} -Body @{
  refreshToken = $Login.tokens.refreshToken
}

$Headers = @{ Authorization = "Bearer $($Refresh.tokens.accessToken)" }
$CreatedApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers ($Headers + @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
}) -Body @{
  name = $ApiKeyName
}

$UpdatedWorkspace = Invoke-JsonRequest -Method Patch -Uri "$ApiBaseUrl/v1/workspaces/current" -Headers ($Headers + @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
}) -Body @{
  name = $WorkspaceName
}

Assert-Equal -Actual $UpdatedWorkspace.workspace.name -Expected $WorkspaceName -Message 'Workspace update response mismatch.'

Invoke-JsonRequest -Method Delete -Uri "$ApiBaseUrl/v1/api-keys/$($CreatedApiKey.apiKey.id)" -Headers ($Headers + @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
}) | Out-Null

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/logout" -Headers @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
} -Body @{
  refreshToken = $Refresh.tokens.refreshToken
} | Out-Null

$SecondLogin = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Headers @{
  'User-Agent' = 'Runlane-Audit-Validation/1.0'
} -Body @{
  email = $Email
  password = $Password
}

$SecondHeaders = @{ Authorization = "Bearer $($SecondLogin.tokens.accessToken)" }
$AuditLogs = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/audit-logs?limit=20" -Headers $SecondHeaders
$Items = @($AuditLogs.items)

if ($Items.Count -lt 7) {
  throw "Expected at least 7 audit events but received $($Items.Count)."
}

Assert-ContainsAction -Items $Items -Action 'identity.user_registered'
Assert-ContainsAction -Items $Items -Action 'identity.user_logged_in'
Assert-ContainsAction -Items $Items -Action 'identity.session_refreshed'
Assert-ContainsAction -Items $Items -Action 'identity.session_logged_out'
Assert-ContainsAction -Items $Items -Action 'workspace.updated'
Assert-ContainsAction -Items $Items -Action 'access.api_key_created'
Assert-ContainsAction -Items $Items -Action 'access.api_key_revoked'

$ForeignWorkspaceItems = @($Items | Where-Object { $_.workspaceId -ne $SecondLogin.workspace.id })

if ($ForeignWorkspaceItems.Count -ne 0) {
  throw 'Audit list returned events outside the authenticated workspace.'
}

$CreatedEvent = @($Items | Where-Object { $_.action -eq 'access.api_key_created' -and $_.entityId -eq $CreatedApiKey.apiKey.id })[0]
Assert-Equal -Actual $CreatedEvent.metadata.prefix -Expected $CreatedApiKey.apiKey.prefix -Message 'API key audit prefix mismatch.'

if (($CreatedEvent.metadata | ConvertTo-Json -Depth 16 -Compress).Contains($CreatedApiKey.token)) {
  throw 'Audit metadata includes the one-time API key token.'
}

$PagedAuditLogs = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/audit-logs?limit=2" -Headers $SecondHeaders

if ($PagedAuditLogs.items.Count -ne 2) {
  throw 'Audit pagination did not return the requested page size.'
}

if ([string]::IsNullOrWhiteSpace($PagedAuditLogs.nextCursor)) {
  throw 'Audit pagination did not return a next cursor.'
}

$NextAuditLogs = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/audit-logs?limit=2&cursor=$($PagedAuditLogs.nextCursor)" -Headers $SecondHeaders

if ($NextAuditLogs.items.Count -lt 1) {
  throw 'Audit pagination cursor did not return the next page.'
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/audit-logs"
}

Invoke-ExpectedFailure -StatusCode 400 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/audit-logs?limit=101" -Headers $SecondHeaders
}

node scripts/validate-audit-log-database.mjs $Email $SecondLogin.workspace.id $CreatedApiKey.apiKey.id

Write-Host "Audit log validation completed for $Email"
