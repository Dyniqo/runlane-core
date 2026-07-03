$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$AllowedOrigin = 'http://localhost:4610'
$DeniedOrigin = 'https://blocked-origin.runlane.invalid'

function Invoke-WebRequestSafe {
  param(
    [Parameter(Mandatory = $true)] [string] $Method,
    [Parameter(Mandatory = $true)] [string] $Uri,
    [AllowNull()] [object] $Body = $null,
    [hashtable] $Headers = @{},
    [AllowNull()] [string] $ContentType = $null
  )

  $Parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    UseBasicParsing = $true
  }

  $NormalizedMethod = $Method.ToUpperInvariant()
  $CanSendBody = $NormalizedMethod -in @('POST', 'PUT', 'PATCH', 'DELETE')

  if ($CanSendBody -and $PSBoundParameters.ContainsKey('Body') -and $null -ne $Body) {
    $Parameters.Body = $Body
  }

  if ($CanSendBody -and -not [string]::IsNullOrWhiteSpace($ContentType)) {
    $Parameters.ContentType = $ContentType
  }

  try {
    Invoke-WebRequest @Parameters
  } catch {
    if ($null -eq $_.Exception.Response) {
      throw
    }

    $_.Exception.Response
  }
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

function Assert-HeaderPresent {
  param(
    [Parameter(Mandatory = $true)] [object] $Response,
    [Parameter(Mandatory = $true)] [string] $Name
  )

  $Value = Get-HeaderValue -Response $Response -Name $Name

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Expected response header '$Name' to be present."
  }

  $Value
}

function Get-HeaderValue {
  param(
    [Parameter(Mandatory = $true)] [object] $Response,
    [Parameter(Mandatory = $true)] [string] $Name
  )

  foreach ($Key in $Response.Headers.Keys) {
    if ([string]::Equals($Key, $Name, [System.StringComparison]::OrdinalIgnoreCase)) {
      $Value = $Response.Headers[$Key]

      if ($Value -is [array]) {
        return ($Value -join ',')
      }

      return [string] $Value
    }
  }

  return $null
}

$Health = Invoke-WebRequestSafe -Method Get -Uri "$ApiBaseUrl/health"
Assert-Equal -Actual ([int] $Health.StatusCode) -Expected 200 -Message 'Health endpoint should be available.'
Assert-HeaderPresent -Response $Health -Name 'X-Content-Type-Options' | Out-Null
Assert-HeaderPresent -Response $Health -Name 'X-Frame-Options' | Out-Null
Assert-HeaderPresent -Response $Health -Name 'Referrer-Policy' | Out-Null
Assert-HeaderPresent -Response $Health -Name 'Cross-Origin-Opener-Policy' | Out-Null
Assert-HeaderPresent -Response $Health -Name 'Origin-Agent-Cluster' | Out-Null

$Preflight = Invoke-WebRequestSafe -Method Options -Uri "$ApiBaseUrl/v1/auth/register" -Headers @{
  Origin = $AllowedOrigin
  'Access-Control-Request-Method' = 'POST'
  'Access-Control-Request-Headers' = 'content-type,authorization,x-request-id,x-correlation-id'
}
Assert-Equal -Actual ([int] $Preflight.StatusCode) -Expected 204 -Message 'CORS preflight should be accepted for the configured origin.'
Assert-Equal -Actual (Get-HeaderValue -Response $Preflight -Name 'Access-Control-Allow-Origin') -Expected $AllowedOrigin -Message 'CORS allowed origin mismatch.'

$AutomationPreflight = Invoke-WebRequestSafe -Method Options -Uri "$ApiBaseUrl/v1/automation/execute/wf_security_probe" -Headers @{
  Origin = $AllowedOrigin
  'Access-Control-Request-Method' = 'POST'
  'Access-Control-Request-Headers' = 'content-type,x-runlane-api-key,x-runlane-source,x-runlane-idempotency-key'
}
Assert-Equal -Actual ([int] $AutomationPreflight.StatusCode) -Expected 204 -Message 'Automation bridge CORS preflight should allow Runlane headers.'
Assert-Equal -Actual (Get-HeaderValue -Response $AutomationPreflight -Name 'Access-Control-Allow-Origin') -Expected $AllowedOrigin -Message 'Automation bridge CORS allowed origin mismatch.'

$Denied = Invoke-WebRequestSafe -Method Get -Uri "$ApiBaseUrl/health" -Headers @{ Origin = $DeniedOrigin }
Assert-Equal -Actual ([int] $Denied.StatusCode) -Expected 200 -Message 'Health endpoint should not fail for a disallowed Origin header.'
Assert-Equal -Actual (Get-HeaderValue -Response $Denied -Name 'Access-Control-Allow-Origin') -Expected $null -Message 'Disallowed CORS origin should not be echoed.'

$LargeName = 'x' * 1200000
$Payload = @{
  email = "runlane.payload.$Timestamp@example.com"
  password = 'RunlanePassword123!'
  name = $LargeName
} | ConvertTo-Json -Depth 4 -Compress
$PayloadResponse = Invoke-WebRequestSafe -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body $Payload -ContentType 'application/json'
Assert-Equal -Actual ([int] $PayloadResponse.StatusCode) -Expected 413 -Message 'Oversized JSON payload should be rejected.'

$RateLimitPath = "/v1/security-rate-limit-probe/$Timestamp"
$FirstRateLimitResponse = Invoke-WebRequestSafe -Method Get -Uri "$ApiBaseUrl$RateLimitPath"
Assert-Equal -Actual ([int] $FirstRateLimitResponse.StatusCode) -Expected 404 -Message 'Rate limit probe should reach the application before the limit is exceeded.'
$LimitHeader = Assert-HeaderPresent -Response $FirstRateLimitResponse -Name 'X-RateLimit-Limit'
Assert-HeaderPresent -Response $FirstRateLimitResponse -Name 'X-RateLimit-Remaining' | Out-Null
Assert-HeaderPresent -Response $FirstRateLimitResponse -Name 'X-RateLimit-Reset' | Out-Null
$Limit = [int] $LimitHeader
$LastRateLimitResponse = $FirstRateLimitResponse

for ($Index = 0; $Index -lt $Limit; $Index++) {
  $LastRateLimitResponse = Invoke-WebRequestSafe -Method Get -Uri "$ApiBaseUrl$RateLimitPath"
}

Assert-Equal -Actual ([int] $LastRateLimitResponse.StatusCode) -Expected 429 -Message 'Redis-backed rate limit should reject requests after the configured quota.'
Assert-HeaderPresent -Response $LastRateLimitResponse -Name 'Retry-After' | Out-Null

Write-Host "Security baseline validation completed for $ApiBaseUrl"
