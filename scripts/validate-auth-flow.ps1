$ErrorActionPreference = "Stop"

function Fail([string] $Message) {
  throw $Message
}

function Invoke-JsonRequest([string] $Method, [string] $Url, [object] $Body, [hashtable] $Headers = @{}) {
  $request = @{
    Method = $Method
    Uri = $Url
    Headers = $Headers
    ContentType = "application/json"
  }

  if ($null -ne $Body) {
    $request.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  Invoke-RestMethod @request
}

function Invoke-ExpectedFailure([scriptblock] $Operation, [int] $StatusCode) {
  try {
    & $Operation | Out-Null
  } catch {
    $response = $_.Exception.Response

    if ($null -eq $response) {
      throw
    }

    if ([int] $response.StatusCode -ne $StatusCode) {
      Fail "Expected HTTP $StatusCode but received $([int] $response.StatusCode)."
    }

    return
  }

  Fail "Expected request failure with HTTP $StatusCode."
}

$apiBaseUrl = $env:RUNLANE_API_BASE_URL
if ([string]::IsNullOrWhiteSpace($apiBaseUrl)) {
  $apiBaseUrl = "http://localhost:4600"
}

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$email = "runlane.auth.$timestamp@example.com"
$password = "RunlanePassword123!"
$name = "Runlane Auth Operator"

$registration = Invoke-JsonRequest "Post" "$apiBaseUrl/v1/auth/register" @{
  email = $email
  password = $password
  name = $name
}

if ($registration.user.email -ne $email) {
  Fail "Registration returned an unexpected email."
}

$login = Invoke-JsonRequest "Post" "$apiBaseUrl/v1/auth/login" @{
  email = $email
  password = $password
}

if ([string]::IsNullOrWhiteSpace($login.tokens.accessToken)) {
  Fail "Login did not return an access token."
}

if ([string]::IsNullOrWhiteSpace($login.tokens.refreshToken)) {
  Fail "Login did not return a refresh token."
}

$me = Invoke-JsonRequest "Get" "$apiBaseUrl/v1/auth/me" $null @{
  Authorization = "Bearer $($login.tokens.accessToken)"
}

if ($me.user.email -ne $email) {
  Fail "Authenticated user endpoint returned an unexpected email."
}

$refresh = Invoke-JsonRequest "Post" "$apiBaseUrl/v1/auth/refresh" @{
  refreshToken = $login.tokens.refreshToken
}

if ($refresh.tokens.refreshToken -eq $login.tokens.refreshToken) {
  Fail "Refresh token was not rotated."
}

Invoke-ExpectedFailure { Invoke-JsonRequest "Post" "$apiBaseUrl/v1/auth/refresh" @{ refreshToken = $login.tokens.refreshToken } } 401

$meAfterRefresh = Invoke-JsonRequest "Get" "$apiBaseUrl/v1/auth/me" $null @{
  Authorization = "Bearer $($refresh.tokens.accessToken)"
}

if ($meAfterRefresh.user.email -ne $email) {
  Fail "Authenticated user endpoint failed after refresh."
}

$logout = Invoke-JsonRequest "Post" "$apiBaseUrl/v1/auth/logout" @{
  refreshToken = $refresh.tokens.refreshToken
}

if ($logout.revoked -ne $true) {
  Fail "Logout did not revoke the session."
}

Invoke-ExpectedFailure { Invoke-JsonRequest "Post" "$apiBaseUrl/v1/auth/refresh" @{ refreshToken = $refresh.tokens.refreshToken } } 401

$env:RUNLANE_VALIDATE_AUTH_EMAIL = $email
node scripts/validate-auth-database.mjs
if ($LASTEXITCODE -ne 0) {
  Fail "Authentication database validation failed."
}

Write-Host "Authentication flow validation completed for $email" -ForegroundColor Green

