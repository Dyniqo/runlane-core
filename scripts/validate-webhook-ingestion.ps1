$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$WebhookSigningSecret = if ($env:WEBHOOK_SIGNING_SECRET) { $env:WEBHOOK_SIGNING_SECRET } else { 'runlane_local_webhook_signing_secret_change_me_64_bytes_minimum_value' }
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
  param(
    [Parameter(Mandatory = $true)] [object] $Payload,
    [int] $TimestampOffsetSeconds = 0
  )

  $TimestampSeconds = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + $TimestampOffsetSeconds
  $PayloadJson = ConvertTo-StableJson $Payload
  $Sha256 = [System.Security.Cryptography.SHA256]::Create()
  $PayloadHash = Convert-ToHex $Sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($PayloadJson))
  $SignedPayload = "$TimestampSeconds.$PayloadHash"
  $Hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($WebhookSigningSecret))
  $Digest = Convert-ToHex $Hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($SignedPayload))

  "t=$TimestampSeconds,v1=$Digest"
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

$Payload = @{
  leadId = "lead-$Timestamp"
  email = 'ada@example.com'
  company = 'Analytical Engines'
  score = 82
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Body $Payload
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers @{
    'X-Runlane-Signature' = 't=1760000000,v1=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  } -Body $Payload
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers @{
    'X-Runlane-Signature' = 't=1760000000,v1=validation'
  } -Body $Payload
}

$WebhookHeaders = @{
  'X-Runlane-Source' = 'website_form'
  'X-Runlane-Idempotency-Key' = $IdempotencyKey
  'X-Runlane-Signature' = (New-RunlaneWebhookSignature -Payload $Payload)
}

$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers $WebhookHeaders -Body $Payload

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

if ([string]::IsNullOrWhiteSpace($Accepted.execution.id)) {
  throw 'Webhook response did not include an execution id.'
}

if ($Accepted.execution.workspaceId -ne $Login.workspace.id) {
  throw 'Webhook execution workspace mismatch.'
}

if ($Accepted.execution.workflowId -ne $Published.workflow.id) {
  throw 'Webhook execution workflow mismatch.'
}

if ($Accepted.execution.workflowPublicId -ne $Published.workflow.publicId) {
  throw 'Webhook execution public id mismatch.'
}

if ($Accepted.execution.workflowVersion -ne $Published.workflow.version) {
  throw 'Webhook execution workflow version mismatch.'
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'Webhook execution was not queued.'
}

if ($Accepted.execution.input.trigger.type -ne 'webhook') {
  throw 'Webhook execution trigger type mismatch.'
}

if ($Accepted.execution.input.trigger.sourceId -ne $Accepted.webhookRequest.id) {
  throw 'Webhook execution trigger source id mismatch.'
}

if ($Accepted.execution.input.payload.leadId -ne $Payload.leadId) {
  throw 'Webhook execution payload was not persisted in the response.'
}

node scripts/wait-for-execution-job.mjs $Accepted.execution.workspaceId $Accepted.execution.id $Accepted.execution.workflowId

$DuplicateHeaders = @{
  'X-Runlane-Source' = 'website_form'
  'X-Runlane-Idempotency-Key' = $IdempotencyKey
  'X-Runlane-Signature' = (New-RunlaneWebhookSignature -Payload $Payload -TimestampOffsetSeconds 1)
}
$Duplicate = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers $DuplicateHeaders -Body $Payload

if ($Duplicate.webhookRequest.id -ne $Accepted.webhookRequest.id) {
  throw 'Idempotent webhook replay did not return the original request.'
}

if ($Duplicate.execution.id -ne $Accepted.execution.id) {
  throw 'Idempotent webhook replay did not return the original execution.'
}

$ConflictingPayload = @{
  leadId = "lead-$Timestamp"
  email = 'ada@example.com'
  company = 'Analytical Engines'
  score = 12
}

Invoke-ExpectedFailure -StatusCode 409 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers @{
    'X-Runlane-Source' = 'website_form'
    'X-Runlane-Idempotency-Key' = $IdempotencyKey
    'X-Runlane-Signature' = (New-RunlaneWebhookSignature -Payload $ConflictingPayload -TimestampOffsetSeconds 2)
  } -Body $ConflictingPayload
}

$ReplayPayload = @{
  leadId = "replay-$Timestamp"
  email = 'grace@example.com'
}
$ReplaySignature = New-RunlaneWebhookSignature -Payload $ReplayPayload -TimestampOffsetSeconds 3
$ReplayHeaders = @{
  'X-Runlane-Source' = 'website_form'
  'X-Runlane-Signature' = $ReplaySignature
}
$ReplayAccepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers $ReplayHeaders -Body $ReplayPayload
node scripts/wait-for-execution-job.mjs $ReplayAccepted.execution.workspaceId $ReplayAccepted.execution.id $ReplayAccepted.execution.workflowId

Invoke-ExpectedFailure -StatusCode 409 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers $ReplayHeaders -Body $ReplayPayload
}

Invoke-ExpectedFailure -StatusCode 400 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($Published.workflow.publicId)" -Headers @{
    'X-Runlane-Signature' = (New-RunlaneWebhookSignature -Payload @('not', 'an', 'object') -TimestampOffsetSeconds 4)
  } -Body @('not', 'an', 'object')
}

Invoke-ExpectedFailure -StatusCode 404 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/wf_00000000000000000000000000000000" -Body @{
    leadId = 'missing-workflow'
  }
}

node scripts/validate-webhook-database.mjs $Email $Published.workflow.id $Accepted.webhookRequest.id $Accepted.execution.id $IdempotencyKey

Write-Host "Webhook ingestion validation completed for $Email"
