$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.engine.$Timestamp@example.com"
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
    throw ("Node script failed with exit code {0}: node {1}" -f $LASTEXITCODE, ($Arguments -join ' '))
  }
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = 'Runlane Engine Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "Engine validation key $Timestamp"
}

$Definition = @{
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
      config = @{ branch = 'route' }
      transitions = @{ branches = @{ route = 'route' } }
    },
    @{
      key = 'route'
      name = 'Route payload'
      type = 'condition'
      config = @{ pass = $true }
      transitions = @{ onSuccess = 'complete' }
    },
    @{
      key = 'complete'
      name = 'Complete execution'
      type = 'condition'
      config = @{}
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Execution engine workflow $Timestamp"
  triggerType = 'automation'
  definition = $Definition
}
$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'engine_validation'
  'X-Runlane-Idempotency-Key' = "engine-$Timestamp"
} -Body @{
  payload = @{
    leadId = "lead-$Timestamp"
    email = 'ada@example.com'
    score = 91
  }
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'Execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-execution-engine-database.mjs', $Email, $Accepted.execution.id, '3')

Write-Host "Execution engine validation completed for $Email"
