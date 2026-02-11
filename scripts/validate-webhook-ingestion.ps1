$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.webhook.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$Name = 'Runlane Webhook Operator'
$WorkflowName = "Lead intake webhook $Timestamp"
$IdempotencyKey = "lead-$Timestamp"

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
    $Parameters.Body = ($Body | ConvertTo-Json -Depth 24 -Compress)
    $Parameters.ContentType = 'application/json'
  }

  Invoke-RestMethod @Parameters
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

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$Definition = @{
  schemaVersion = 1
  trigger = @{
    type = 'webhook'
    config = @{}
  }
  entryStepKey = 'qualify_lead'
  steps = @(
    @{
      key = 'qualify_lead'
      name = 'Qualify lead'
      type = 'condition'
      config = @{}
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = $WorkflowName
  triggerType = 'webhook'
  definition = $Definition
}

Invoke-ExpectedFailure -StatusCode 404 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Workflow.workflow.publicId)" -Body @{
    leadId = 'lead-before-publish'
  }
}

$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders

$WebhookHeaders = @{
  'X-Runlane-Source' = 'website_form'
  'X-Runlane-Idempotency-Key' = $IdempotencyKey
  'X-Runlane-Signature' = 't=1760000000,v1=validation'
}

$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers $WebhookHeaders -Body @{
  leadId = "lead-$Timestamp"
  email = 'ada@example.com'
  company = 'Analytical Engines'
  score = 82
}

if ($Accepted.webhookRequest.workflowId -ne $Published.workflow.id) {
  throw 'Webhook response workflow id mismatch.'
}

if ($Accepted.webhookRequest.workflowPublicId -ne $Published.workflow.publicId) {
  throw 'Webhook response workflow public id mismatch.'
}

if ($Accepted.webhookRequest.workspaceId -ne $Login.workspace.id) {
  throw 'Webhook response workspace id mismatch.'
}

if ($Accepted.webhookRequest.status -ne 'accepted') {
  throw 'Webhook request was not accepted.'
}

if ($Accepted.webhookRequest.source -ne 'website_form') {
  throw 'Webhook source mismatch.'
}

if ($Accepted.webhookRequest.idempotencyKey -ne $IdempotencyKey) {
  throw 'Webhook idempotency key mismatch.'
}

if ([string]::IsNullOrWhiteSpace($Accepted.webhookRequest.payloadHash)) {
  throw 'Webhook response did not include a payload hash.'
}

Invoke-ExpectedFailure -StatusCode 400 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Body @('not', 'an', 'object')
}

Invoke-ExpectedFailure -StatusCode 404 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/wf_00000000000000000000000000000000" -Body @{
    leadId = 'missing-workflow'
  }
}

node scripts/validate-webhook-database.mjs $Email $Published.workflow.id $Accepted.webhookRequest.id $IdempotencyKey

Write-Host "Webhook ingestion validation completed for $Email"
