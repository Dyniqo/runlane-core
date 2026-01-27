$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.workspace.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$Name = 'Runlane Workspace Operator'
$UpdatedWorkspaceName = "Runlane Workspace $Timestamp"

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
    [Parameter(Mandatory = $true)] [object] $Actual,
    [Parameter(Mandatory = $true)] [object] $Expected,
    [Parameter(Mandatory = $true)] [string] $Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected' but received '$Actual'."
  }
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = $Name
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AccessToken = $Login.tokens.accessToken
$WorkspaceId = $Login.workspace.id
$AuthorizationHeaders = @{ Authorization = "Bearer $AccessToken" }

$Current = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workspaces/current" -Headers $AuthorizationHeaders
Assert-Equal -Actual $Current.workspace.id -Expected $WorkspaceId -Message 'Current workspace id mismatch.'
Assert-Equal -Actual $Current.scope.workspaceId -Expected $WorkspaceId -Message 'Resolved workspace scope mismatch.'
Assert-Equal -Actual $Current.scope.role -Expected 'owner' -Message 'Resolved workspace role mismatch.'

$List = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workspaces" -Headers $AuthorizationHeaders
if ($List.items.Count -lt 1) {
  throw 'Workspace list is empty.'
}

$Updated = Invoke-JsonRequest -Method Patch -Uri "$ApiBaseUrl/v1/workspaces/current" -Headers $AuthorizationHeaders -Body @{
  name = $UpdatedWorkspaceName
}
Assert-Equal -Actual $Updated.workspace.name -Expected $UpdatedWorkspaceName -Message 'Workspace update response mismatch.'

$UnauthorizedFailed = $false
try {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workspaces/current" | Out-Null
} catch {
  $UnauthorizedFailed = $true
}

if (-not $UnauthorizedFailed) {
  throw 'Workspace endpoint accepted a request without authentication.'
}

node scripts/validate-workspace-scope-database.mjs $Email $UpdatedWorkspaceName

Write-Host "Workspace scope validation completed for $Email"


