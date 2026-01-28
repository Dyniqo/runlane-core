$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.apikey.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$Name = 'Runlane API Key Operator'
$ApiKeyName = "Primary automation key $Timestamp"

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

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = $Name
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$Headers = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$Created = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $Headers -Body @{
  name = $ApiKeyName
}

if ([string]::IsNullOrWhiteSpace($Created.token)) {
  throw 'API key creation did not return the one-time token.'
}

if (-not $Created.token.StartsWith("$($Created.apiKey.prefix)_")) {
  throw 'API key token does not start with the returned prefix.'
}

Assert-Equal -Actual $Created.apiKey.name -Expected $ApiKeyName -Message 'API key name mismatch.'
Assert-Equal -Actual $Created.apiKey.revokedAt -Expected $null -Message 'New API key should not be revoked.'

$Current = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/api-keys/current" -Headers @{
  'X-Runlane-Api-Key' = $Created.token
}

Assert-Equal -Actual $Current.apiKey.id -Expected $Created.apiKey.id -Message 'Current API key id mismatch.'
Assert-Equal -Actual $Current.apiKey.workspaceId -Expected $Login.workspace.id -Message 'Current API key workspace mismatch.'
Assert-Equal -Actual $Current.apiKey.prefix -Expected $Created.apiKey.prefix -Message 'Current API key prefix mismatch.'

if ([string]::IsNullOrWhiteSpace($Current.apiKey.lastUsedAt)) {
  throw 'API key guard did not return lastUsedAt.'
}

$List = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/api-keys" -Headers $Headers
$Listed = @($List.items | Where-Object { $_.id -eq $Created.apiKey.id })

if ($Listed.Count -ne 1) {
  throw 'Created API key was not returned by the workspace-scoped list endpoint.'
}

if ([string]::IsNullOrWhiteSpace($Listed[0].lastUsedAt)) {
  throw 'API key last-used tracking was not persisted.'
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/api-keys"
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/api-keys/current" -Headers @{
    'X-Runlane-Api-Key' = 'rln_invalid00_invalid000000000000000000000000000000000000000'
  }
}

$Revoked = Invoke-JsonRequest -Method Delete -Uri "$ApiBaseUrl/v1/api-keys/$($Created.apiKey.id)" -Headers $Headers
Assert-Equal -Actual $Revoked.revoked -Expected $true -Message 'API key revocation response mismatch.'

$AfterRevoke = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/api-keys" -Headers $Headers
$RevokedItem = @($AfterRevoke.items | Where-Object { $_.id -eq $Created.apiKey.id })

if ($RevokedItem.Count -ne 1) {
  throw 'Revoked API key was not returned for auditability.'
}

if ([string]::IsNullOrWhiteSpace($RevokedItem[0].revokedAt)) {
  throw 'Revoked API key does not include revokedAt.'
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/api-keys/current" -Headers @{
    'X-Runlane-Api-Key' = $Created.token
  }
}

Invoke-ExpectedFailure -StatusCode 403 -Operation {
  Invoke-JsonRequest -Method Delete -Uri "$ApiBaseUrl/v1/api-keys/$($Created.apiKey.id)" -Headers $Headers
}

node scripts/validate-api-key-database.mjs $Email $Created.apiKey.id $Created.apiKey.prefix

Write-Host "API key validation completed for $Email"
