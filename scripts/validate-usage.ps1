$ErrorActionPreference = 'Stop'

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$WebhookSigningSecret = if ($env:WEBHOOK_SIGNING_SECRET) { $env:WEBHOOK_SIGNING_SECRET } else { 'runlane_local_webhook_signing_secret_change_me_64_bytes_minimum_value' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.usage.$Timestamp@example.com"
$Password = 'RunlanePassword123!'

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

function Convert-ToHex {
  param([Parameter(Mandatory = $true)] [byte[]] $Bytes)

  ($Bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

function ConvertTo-StableJson {
  param([AllowNull()] [object] $Value)

  if ($null -eq $Value) {
    return 'null'
  }

  if ($Value -is [string]) {
    return ($Value | ConvertTo-Json -Compress)
  }

  if ($Value -is [bool]) {
    if ($Value) {
      return 'true'
    }

    return 'false'
  }

  if ($Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int] -or $Value -is [uint32] -or $Value -is [long] -or $Value -is [uint64] -or $Value -is [float] -or $Value -is [double] -or $Value -is [decimal]) {
    return ([System.Convert]::ToString($Value, [System.Globalization.CultureInfo]::InvariantCulture))
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $Entries = @()

    foreach ($Key in @($Value.Keys | ForEach-Object { [string] $_ } | Sort-Object)) {
      $Entries += "$(ConvertTo-StableJson $Key):$(ConvertTo-StableJson $Value[$Key])"
    }

    return "{$($Entries -join ',')}"
  }

  if ($Value -is [System.Collections.IEnumerable]) {
    $Items = @()

    foreach ($Item in $Value) {
      $Items += ConvertTo-StableJson $Item
    }

    return "[$($Items -join ',')]"
  }

  $Properties = @{}

  foreach ($Property in $Value.PSObject.Properties) {
    $Properties[$Property.Name] = $Property.Value
  }

  return ConvertTo-StableJson $Properties
}

function New-RunlaneWebhookSignature {
  param([Parameter(Mandatory = $true)] [object] $Payload)

  $TimestampSeconds = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $PayloadJson = ConvertTo-StableJson $Payload
  $Sha256 = [System.Security.Cryptography.SHA256]::Create()
  $PayloadHash = Convert-ToHex $Sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($PayloadJson))
  $SignedPayload = "$TimestampSeconds.$PayloadHash"
  $Hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($WebhookSigningSecret))
  $Digest = Convert-ToHex $Hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($SignedPayload))

  "t=$TimestampSeconds,v1=$Digest"
}

function Invoke-AutomationWorkflow {
  param(
    [Parameter(Mandatory = $true)] [object] $Workflow,
    [Parameter(Mandatory = $true)] [string] $ApiKeyToken,
    [Parameter(Mandatory = $true)] [string] $Source,
    [Parameter(Mandatory = $true)] [object] $Payload
  )

  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Workflow.workflow.publicId)" -Headers @{
    'X-Runlane-Api-Key' = $ApiKeyToken
    'X-Runlane-Source' = $Source
    'X-Runlane-Idempotency-Key' = "$Source-$Timestamp"
  } -Body @{ payload = $Payload }
}

function New-AutomationWorkflow {
  param(
    [Parameter(Mandatory = $true)] [hashtable] $AuthHeaders,
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [object] $Definition
  )

  $Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
    name = $Name
    triggerType = 'automation'
    definition = $Definition
  }

  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = 'Runlane Usage Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "Usage validation key $Timestamp"
}

$InitialUsage = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/usage/current" -Headers $AuthHeaders

if ($InitialUsage.totals.executions -ne 0 -or $InitialUsage.totals.webhookRequests -ne 0 -or $InitialUsage.totals.httpCalls -ne 0 -or $InitialUsage.totals.aiCalls -ne 0 -or $InitialUsage.totals.retries -ne 0) {
  throw 'Initial usage counters were not empty for the new workspace.'
}

$WebhookDefinition = @{
  schemaVersion = 1
  trigger = @{ type = 'webhook'; config = @{} }
  entryStepKey = 'accept_lead'
  steps = @(
    @{
      key = 'accept_lead'
      name = 'Accept lead'
      type = 'condition'
      config = @{}
    }
  )
}

$WebhookWorkflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Usage webhook workflow $Timestamp"
  triggerType = 'webhook'
  definition = $WebhookDefinition
}
$WebhookPublished = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($WebhookWorkflow.workflow.id)/publish" -Headers $AuthHeaders
$WebhookPayload = @{
  leadId = "lead-$Timestamp"
  email = 'usage@example.com'
  source = 'usage_validation'
}
$WebhookAccepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($WebhookPublished.workflow.publicId)" -Headers @{
  'X-Runlane-Source' = 'usage_validation'
  'X-Runlane-Idempotency-Key' = "usage-webhook-$Timestamp"
  'X-Runlane-Signature' = (New-RunlaneWebhookSignature -Payload $WebhookPayload)
} -Body $WebhookPayload
Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $WebhookAccepted.execution.workspaceId, $WebhookAccepted.execution.id, $WebhookAccepted.execution.workflowId)

$HttpDefinition = @{
  schemaVersion = 1
  trigger = @{ type = 'automation'; config = @{} }
  entryStepKey = 'blocked_http'
  steps = @(
    @{
      key = 'blocked_http'
      name = 'Blocked HTTP request'
      type = 'http'
      timeoutMs = 5000
      config = @{
        request = @{
          method = 'POST'
          url = 'http://127.0.0.1:1/internal'
          bodyType = 'json'
          body = @{ source = 'usage_validation' }
        }
        auth = @{ mode = 'none' }
        response = @{
          successStatusCodes = @(200)
          retryStatusCodes = @(408, 425, 429, 500, 502, 503, 504)
          includeHeaders = $false
          maxBodyBytes = 2048
        }
      }
    }
  )
}
$HttpWorkflow = New-AutomationWorkflow -AuthHeaders $AuthHeaders -Name "Usage HTTP workflow $Timestamp" -Definition $HttpDefinition
$HttpAccepted = Invoke-AutomationWorkflow -Workflow $HttpWorkflow -ApiKeyToken $ApiKey.token -Source 'usage_http_validation' -Payload @{ leadId = "http-$Timestamp" }
Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $HttpAccepted.execution.workspaceId, $HttpAccepted.execution.id, $HttpAccepted.execution.workflowId)

$AiDefinition = @{
  schemaVersion = 1
  trigger = @{ type = 'automation'; config = @{} }
  entryStepKey = 'ai_route'
  steps = @(
    @{
      key = 'ai_route'
      name = 'Route lead with AI'
      type = 'ai_decision'
      timeoutMs = 30000
      config = @{
        messages = @(
          @{ role = 'system'; content = 'Return a JSON object that matches the schema.' }
          @{ role = 'user'; content = 'Lead id: {{ payload.leadId }}. Return qualified branch.' }
        )
        schema = @{
          type = 'object'
          required = @('branch')
          additionalProperties = $false
          properties = @{
            branch = @{ type = 'string'; enum = @('qualified') }
          }
        }
        branchPath = 'branch'
      }
    }
  )
}
$AiWorkflow = New-AutomationWorkflow -AuthHeaders $AuthHeaders -Name "Usage AI workflow $Timestamp" -Definition $AiDefinition
$AiAccepted = Invoke-AutomationWorkflow -Workflow $AiWorkflow -ApiKeyToken $ApiKey.token -Source 'usage_ai_validation' -Payload @{ leadId = "ai-$Timestamp" }
Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $AiAccepted.execution.workspaceId, $AiAccepted.execution.id, $AiAccepted.execution.workflowId)

$RetryDefinition = @{
  schemaVersion = 1
  trigger = @{ type = 'automation'; config = @{} }
  entryStepKey = 'slow_condition'
  steps = @(
    @{
      key = 'slow_condition'
      name = 'Slow retryable step'
      type = 'condition'
      timeoutMs = 100
      config = @{ delayMs = 1000 }
    }
  )
}
$RetryWorkflow = New-AutomationWorkflow -AuthHeaders $AuthHeaders -Name "Usage retry workflow $Timestamp" -Definition $RetryDefinition
$RetryAccepted = Invoke-AutomationWorkflow -Workflow $RetryWorkflow -ApiKeyToken $ApiKey.token -Source 'usage_retry_validation' -Payload @{ leadId = "retry-$Timestamp" }
Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $RetryAccepted.execution.workspaceId, $RetryAccepted.execution.id, $RetryAccepted.execution.workflowId)

$CurrentUsage = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/usage/current" -Headers $AuthHeaders

if ($CurrentUsage.totals.executions -lt 4) {
  throw "Expected at least four executions in current usage, found $($CurrentUsage.totals.executions)."
}

if ($CurrentUsage.totals.webhookRequests -lt 1) {
  throw 'Expected at least one webhook request in current usage.'
}

if ($CurrentUsage.totals.httpCalls -lt 1) {
  throw 'Expected at least one HTTP call in current usage.'
}

if ($CurrentUsage.totals.aiCalls -lt 1) {
  throw 'Expected at least one AI call in current usage.'
}

if ($CurrentUsage.totals.retries -lt 1) {
  throw 'Expected at least one retry in current usage.'
}

Invoke-NodeScript -Arguments @(
  'scripts/validate-usage-database.mjs',
  $Email,
  $WebhookAccepted.execution.id,
  $HttpAccepted.execution.id,
  $AiAccepted.execution.id,
  $RetryAccepted.execution.id
)

Write-Host "Usage validation completed for $Email"
