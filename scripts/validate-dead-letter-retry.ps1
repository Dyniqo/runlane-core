$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.deadletter.$Timestamp@example.com"
$Password = 'RunlanePassword123!'

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

function Invoke-NodeScript {
  param([Parameter(Mandatory = $true)] [string[]] $Arguments)

  & node @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw ('Node script failed with exit code {0}: node {1}' -f $LASTEXITCODE, ($Arguments -join ' '))
  }
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = 'Runlane Dead Letter Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "Dead letter validation key $Timestamp"
}

$Definition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'always_timeout'
  steps = @(
    @{
      key = 'always_timeout'
      name = 'Always timeout'
      type = 'condition'
      timeoutMs = 100
      config = @{
        delayMs = 600
        pass = $true
      }
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Dead letter workflow $Timestamp"
  triggerType = 'automation'
  definition = $Definition
}
$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'dead_letter_validation'
  'X-Runlane-Idempotency-Key' = "dead-letter-$Timestamp"
} -Body @{
  payload = @{
    leadId = "lead-$Timestamp"
    retry = $true
  }
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'Dead letter validation execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-dead-letter-database.mjs', $Email, $Accepted.execution.id, 'initial')

$BeforeRetry = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/executions/$($Accepted.execution.id)" -Headers $AuthHeaders

if ($BeforeRetry.execution.status -ne 'dead_letter') {
  throw 'Execution was not visible as dead_letter before manual retry.'
}

$Retry = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/executions/$($Accepted.execution.id)/retry" -Headers $AuthHeaders

if ($Retry.execution.status -ne 'queued') {
  throw 'Manual retry did not move the execution back to queued.'
}

if ($Retry.execution.attempts -ne 0) {
  throw 'Manual retry did not reset execution attempts.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-dead-letter-database.mjs', $Email, $Accepted.execution.id, 'manual')

$Steps = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/executions/$($Accepted.execution.id)/steps" -Headers $AuthHeaders
$FailedStep = @($Steps.items | Where-Object { $_.stepKey -eq 'always_timeout' -and $_.status -eq 'failed' })

if ($FailedStep.Count -ne 1) {
  throw 'Manual retry did not expose the final failed execution step.'
}

Write-Host "Dead-letter retry validation completed for $Email"
