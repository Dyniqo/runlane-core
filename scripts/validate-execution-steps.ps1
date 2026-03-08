$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.steps.$Timestamp@example.com"
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
  name = 'Runlane Step Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "Step validation key $Timestamp"
}

$SucceededDefinition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'ingest'
  steps = @(
    @{
      key = 'ingest'
      name = 'Ingest payload'
      type = 'condition'
      timeoutMs = 1000
      config = @{ branch = 'route' }
      transitions = @{ branches = @{ route = 'route' } }
    },
    @{
      key = 'route'
      name = 'Route payload'
      type = 'condition'
      timeoutMs = 1000
      config = @{ pass = $true }
      transitions = @{ onSuccess = 'complete' }
    },
    @{
      key = 'complete'
      name = 'Complete execution'
      type = 'condition'
      timeoutMs = 1000
      config = @{}
    }
  )
}

$SucceededWorkflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Execution step workflow $Timestamp"
  triggerType = 'automation'
  definition = $SucceededDefinition
}
$SucceededPublished = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($SucceededWorkflow.workflow.id)/publish" -Headers $AuthHeaders
$SucceededAccepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($SucceededPublished.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'step_validation'
  'X-Runlane-Idempotency-Key' = "steps-success-$Timestamp"
} -Body @{
  payload = @{
    leadId = "lead-$Timestamp"
    email = 'ada@example.com'
    score = 91
  }
}

if ($SucceededAccepted.execution.status -ne 'queued') {
  throw 'Succeeded validation execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $SucceededAccepted.execution.workspaceId, $SucceededAccepted.execution.id, $SucceededAccepted.execution.workflowId)

$FailedDefinition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'external_call'
  steps = @(
    @{
      key = 'external_call'
      name = 'External call'
      type = 'http'
      timeoutMs = 1000
      config = @{
        url = 'https://example.com'
        method = 'POST'
      }
    }
  )
}

$FailedWorkflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Execution step failure workflow $Timestamp"
  triggerType = 'automation'
  definition = $FailedDefinition
}
$FailedPublished = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($FailedWorkflow.workflow.id)/publish" -Headers $AuthHeaders
$FailedAccepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($FailedPublished.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'step_validation'
  'X-Runlane-Idempotency-Key' = "steps-failure-$Timestamp"
} -Body @{
  payload = @{
    leadId = "lead-failed-$Timestamp"
    email = 'grace@example.com'
  }
}

if ($FailedAccepted.execution.status -ne 'queued') {
  throw 'Failed validation execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $FailedAccepted.execution.workspaceId, $FailedAccepted.execution.id, $FailedAccepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-execution-steps-database.mjs', $Email, $SucceededAccepted.execution.id, '3', $FailedAccepted.execution.id)

Write-Host "Execution step validation completed for $Email"
