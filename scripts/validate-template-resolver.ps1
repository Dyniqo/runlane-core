$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.templates.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$LeadId = "lead-$Timestamp"

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
  name = 'Runlane Template Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "Template validation key $Timestamp"
}

$Definition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'classify'
  steps = @(
    @{
      key = 'classify'
      name = 'Classify lead'
      type = 'condition'
      timeoutMs = 1000
      config = @{
        branch = '{{ payload.routing.branch }}'
        pass = '{{ payload.accepted }}'
        leadMessage = 'Lead {{ payload.lead.id }} assigned to {{ payload.routing.branch }}'
        secretToken = '{{ secrets.routing_token }}'
      }
      transitions = @{ branches = @{ premium = 'notify' } }
    },
    @{
      key = 'notify'
      name = 'Prepare notification'
      type = 'condition'
      timeoutMs = 1000
      config = @{
        branch = '{{ steps.classify.output.branch }}'
        pass = $true
        summary = 'Route {{ steps.classify.output.branch }} for {{ payload.lead.email }}'
      }
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Template resolver workflow $Timestamp"
  triggerType = 'automation'
  definition = $Definition
}
$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'template_validation'
  'X-Runlane-Idempotency-Key' = "templates-$Timestamp"
} -Body @{
  payload = @{
    accepted = $true
    lead = @{
      id = $LeadId
      email = 'linus@example.com'
    }
    routing = @{
      branch = 'premium'
    }
  }
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'Template validation execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-template-resolver-database.mjs', $Email, $Accepted.execution.id, $LeadId)

Write-Host "Template resolver validation completed for $Email"
