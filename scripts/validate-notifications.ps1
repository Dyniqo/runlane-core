$ErrorActionPreference = 'Stop'

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.notifications.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$LeadId = "lead-$Timestamp"

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)] [string] $Method,
    [Parameter(Mandatory = $true)] [string] $Uri,
    [AllowNull()] [object] $Body = $null,
    [hashtable] $Headers = @{},
    [int] $TimeoutSec = 30
  )

  $Parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    TimeoutSec = $TimeoutSec
  }

  if ($PSBoundParameters.ContainsKey('Body') -and $null -ne $Body) {
    $Parameters.Body = ($Body | ConvertTo-Json -Depth 64 -Compress)
    $Parameters.ContentType = 'application/json'
  }

  Invoke-RestMethod @Parameters
}

function Invoke-NodeScript {
  param([Parameter(Mandatory = $true)] [string[]] $Arguments)

  & node @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw ('Node script failed with exit code {0}: node {1}' -f $LASTEXITCODE, ($Arguments -join ' '))
  }
}

function Read-EnvValue {
  param([Parameter(Mandatory = $true)] [string] $Name)

  $ProcessValue = [Environment]::GetEnvironmentVariable($Name)

  if ($ProcessValue -and $ProcessValue.Trim().Length -gt 0) {
    return $ProcessValue.Trim()
  }

  $EnvFile = Join-Path (Get-Location) '.env'

  if (-not (Test-Path $EnvFile)) {
    return ''
  }

  foreach ($Line in Get-Content $EnvFile) {
    $Trimmed = $Line.Trim()

    if ($Trimmed.Length -eq 0 -or $Trimmed.StartsWith('#')) {
      continue
    }

    $Prefix = "$Name="

    if ($Trimmed.StartsWith($Prefix)) {
      return $Trimmed.Substring($Prefix.Length).Trim().Trim('"').Trim("'")
    }
  }

  ''
}

$ExpectedSuccess = 'false'
$ConfiguredSlackWebhook = Read-EnvValue -Name 'SLACK_WEBHOOK_URL'

if ($ConfiguredSlackWebhook.Length -gt 0) {
  $ExpectedSuccess = 'true'
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = 'Runlane Notification Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "Notification validation key $Timestamp"
}

$Definition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'notify_team'
  steps = @(
    @{
      key = 'notify_team'
      name = 'Notify team'
      type = 'notification'
      timeoutMs = 15000
      config = @{
        provider = 'slack'
        title = 'Runlane notification validation'
        message = 'Notification validation for lead {{ payload.lead.id }} from {{ payload.lead.email }}.'
        severity = 'info'
        includeExecutionContext = $true
        metadata = @{
          source = 'notification_validation'
          expectedSuccess = $ExpectedSuccess
        }
      }
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Notification workflow $Timestamp"
  triggerType = 'automation'
  definition = $Definition
}

$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'notification_validation'
  'X-Runlane-Idempotency-Key' = "notification-$Timestamp"
} -Body @{
  payload = @{
    lead = @{
      id = $LeadId
      email = 'notification@example.com'
      company = 'Runlane Validation'
    }
  }
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'Notification execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-notifications-database.mjs', $Email, $Accepted.execution.id, $LeadId, $ExpectedSuccess)

if ($ExpectedSuccess -eq 'true') {
  Write-Host "Notification validation completed for $Email with configured Slack delivery"
} else {
  Write-Host "Notification validation completed for $Email without Slack webhook credentials; fail-fast path verified"
}
