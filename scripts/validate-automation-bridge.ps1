$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.automation.$Timestamp@example.com"
$OtherEmail = "runlane.automation.other.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$Name = 'Runlane Automation Operator'
$ApiKeyName = "Automation bridge key $Timestamp"
$WorkflowName = "Automation bridge workflow $Timestamp"
$IdempotencyKey = "automation-$Timestamp"

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)] [string] $Method,
    [Parameter(Mandatory = $true)] [string] $Uri,
    [AllowNull()] [object] $Body = $null,
    [hashtable] $Headers = @{}
  )

  $Parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
  }

  if ($PSBoundParameters.ContainsKey('Body') -and $null -ne $Body) {
    $Parameters.Body = ($Body | ConvertTo-Json -Depth 32 -Compress)
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

function New-WorkflowDefinition {
  param([Parameter(Mandatory = $true)] [string] $TriggerType)

  @{
    schemaVersion = 1
    trigger = @{
      type = $TriggerType
      config = @{}
    }
    entryStepKey = 'normalize_lead'
    steps = @(
      @{
        key = 'normalize_lead'
        name = 'Normalize lead'
        type = 'condition'
        config = @{
          expression = 'payload.email != null'
        }
      }
    )
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

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = $ApiKeyName
}
$ApiKeyHeaders = @{ 'X-Runlane-Api-Key' = $ApiKey.token }

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = $WorkflowName
  triggerType = 'automation'
  definition = (New-WorkflowDefinition -TriggerType 'automation')
}
$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/automation/contracts/$($Published.workflow.publicId)"
}

$Contract = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/automation/contracts/$($Published.workflow.publicId)" -Headers $ApiKeyHeaders
Assert-Equal -Actual $Contract.contract.mode -Expected 'automation_bridge' -Message 'Automation contract mode mismatch.'
Assert-Equal -Actual $Contract.contract.workflowId -Expected $Published.workflow.id -Message 'Automation contract workflow id mismatch.'
Assert-Equal -Actual $Contract.contract.workflowPublicId -Expected $Published.workflow.publicId -Message 'Automation contract public id mismatch.'
Assert-Equal -Actual $Contract.contract.workspaceId -Expected $Login.workspace.id -Message 'Automation contract workspace mismatch.'
Assert-Equal -Actual $Contract.contract.workflowVersion -Expected $Published.workflow.version -Message 'Automation contract version mismatch.'
Assert-Equal -Actual $Contract.contract.triggerType -Expected 'automation' -Message 'Automation contract trigger type mismatch.'
Assert-Equal -Actual $Contract.contract.entryStepKey -Expected 'normalize_lead' -Message 'Automation contract entry step mismatch.'
Assert-Equal -Actual $Contract.contract.stepCount -Expected 1 -Message 'Automation contract step count mismatch.'
Assert-Equal -Actual $Contract.contract.request.authentication -Expected 'api_key' -Message 'Automation contract authentication mismatch.'

$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'zapier'
  'X-Runlane-Idempotency-Key' = $IdempotencyKey
} -Body @{
  payload = @{
    leadId = "lead-$Timestamp"
    email = 'ada@example.com'
    company = 'Analytical Engines'
    score = 88
  }
  metadata = @{
    scenarioId = "scenario-$Timestamp"
  }
}

Assert-Equal -Actual $Accepted.automationRequest.workflowId -Expected $Published.workflow.id -Message 'Automation response workflow id mismatch.'
Assert-Equal -Actual $Accepted.automationRequest.workflowPublicId -Expected $Published.workflow.publicId -Message 'Automation response public id mismatch.'
Assert-Equal -Actual $Accepted.automationRequest.workspaceId -Expected $Login.workspace.id -Message 'Automation response workspace mismatch.'
Assert-Equal -Actual $Accepted.automationRequest.workflowVersion -Expected $Published.workflow.version -Message 'Automation response version mismatch.'
Assert-Equal -Actual $Accepted.automationRequest.status -Expected 'accepted' -Message 'Automation response status mismatch.'
Assert-Equal -Actual $Accepted.automationRequest.source -Expected 'zapier' -Message 'Automation response source mismatch.'
Assert-Equal -Actual $Accepted.automationRequest.idempotencyKey -Expected $IdempotencyKey -Message 'Automation response idempotency mismatch.'

if ([string]::IsNullOrWhiteSpace($Accepted.automationRequest.id)) {
  throw 'Automation response did not include a request id.'
}

if ([string]::IsNullOrWhiteSpace($Accepted.automationRequest.payloadHash)) {
  throw 'Automation response did not include a payload hash.'
}

if ([string]::IsNullOrWhiteSpace($Accepted.automationRequest.acceptedAt)) {
  throw 'Automation response did not include acceptedAt.'
}

if ([string]::IsNullOrWhiteSpace($Accepted.execution.id)) {
  throw 'Automation response did not include an execution id.'
}

Assert-Equal -Actual $Accepted.execution.workspaceId -Expected $Login.workspace.id -Message 'Automation execution workspace mismatch.'
Assert-Equal -Actual $Accepted.execution.workflowId -Expected $Published.workflow.id -Message 'Automation execution workflow id mismatch.'
Assert-Equal -Actual $Accepted.execution.workflowPublicId -Expected $Published.workflow.publicId -Message 'Automation execution public id mismatch.'
Assert-Equal -Actual $Accepted.execution.workflowVersion -Expected $Published.workflow.version -Message 'Automation execution version mismatch.'
Assert-Equal -Actual $Accepted.execution.status -Expected 'queued' -Message 'Automation execution status mismatch.'
Assert-Equal -Actual $Accepted.execution.input.trigger.type -Expected 'automation_bridge' -Message 'Automation execution trigger type mismatch.'
Assert-Equal -Actual $Accepted.execution.input.trigger.sourceId -Expected $Accepted.automationRequest.id -Message 'Automation execution trigger source mismatch.'
Assert-Equal -Actual $Accepted.execution.input.payload.leadId -Expected "lead-$Timestamp" -Message 'Automation execution payload mismatch.'

$BodySource = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers $ApiKeyHeaders -Body @{
  payload = @{
    leadId = "lead-body-$Timestamp"
    email = 'grace@example.com'
  }
  source = 'n8n'
  idempotencyKey = "body-$IdempotencyKey"
}
Assert-Equal -Actual $BodySource.automationRequest.source -Expected 'n8n' -Message 'Automation body source was not applied.'
Assert-Equal -Actual $BodySource.automationRequest.idempotencyKey -Expected "body-$IdempotencyKey" -Message 'Automation body idempotency was not applied.'
Assert-Equal -Actual $BodySource.execution.input.trigger.sourceId -Expected $BodySource.automationRequest.id -Message 'Automation body execution source mismatch.'

Invoke-ExpectedFailure -StatusCode 400 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers $ApiKeyHeaders -Body @{
    payload = 'not-an-object'
  }
}

$WebhookWorkflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Webhook only $Timestamp"
  triggerType = 'webhook'
  definition = (New-WorkflowDefinition -TriggerType 'webhook')
}
$PublishedWebhookWorkflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($WebhookWorkflow.workflow.id)/publish" -Headers $AuthHeaders

Invoke-ExpectedFailure -StatusCode 409 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($PublishedWebhookWorkflow.workflow.publicId)" -Headers $ApiKeyHeaders -Body @{
    payload = @{
      leadId = 'wrong-trigger'
    }
  }
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $OtherEmail
  password = $Password
  name = 'Other Automation Operator'
} | Out-Null
$OtherLogin = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $OtherEmail
  password = $Password
}
$OtherApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers @{ Authorization = "Bearer $($OtherLogin.tokens.accessToken)" } -Body @{
  name = "Other automation key $Timestamp"
}

Invoke-ExpectedFailure -StatusCode 404 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/automation/contracts/$($Published.workflow.publicId)" -Headers @{
    'X-Runlane-Api-Key' = $OtherApiKey.token
  }
}

$Audit = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/audit-logs?limit=100" -Headers $AuthHeaders
$AutomationEvents = @($Audit.items | Where-Object { $_.action -eq 'automation.bridge_request_received' -and $_.entityId -eq $Published.workflow.id })

if ($AutomationEvents.Count -lt 2) {
  throw 'Automation bridge audit events were not persisted.'
}

node scripts/validate-execution-database.mjs $Email $Accepted.execution.id $Accepted.automationRequest.id automation_bridge

Write-Host "Automation bridge validation completed for $Email"
