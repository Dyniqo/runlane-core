$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL.TrimEnd('/') } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.demo.integration.$Timestamp@example.com"
$Password = 'RunlanePassword123!'

function Invoke-RunlaneJsonRequest {
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

  if ($null -ne $Body) {
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

Write-Host 'Runlane API integration demo'
Write-Host "API: $ApiBaseUrl"

Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = 'Runlane Integration Operator'
} | Out-Null

$Login = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}
$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }

$ApiKey = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "API integration key $Timestamp"
}

$Definition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'call_external_api'
  steps = @(
    @{
      key = 'call_external_api'
      name = 'Call echo endpoint'
      type = 'http'
      timeoutMs = 10000
      config = @{
        request = @{
          method = 'POST'
          url = 'https://postman-echo.com/post'
          bodyType = 'json'
          headers = @{
            'x-runlane-demo' = 'api-integration'
          }
          body = @{
            leadId = '{{ payload.leadId }}'
            email = '{{ payload.email }}'
            source = '{{ payload.source }}'
          }
        }
        auth = @{
          mode = 'none'
        }
        response = @{
          successStatusCodes = @(200)
          retryStatusCodes = @(408, 429, 500, 502, 503, 504)
          includeHeaders = $false
          maxBodyBytes = 65536
        }
      }
    }
  )
}

$Workflow = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "API integration workflow $Timestamp"
  triggerType = 'automation'
  definition = $Definition
}
$Published = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders

$Accepted = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'demo_script'
  'X-Runlane-Idempotency-Key' = "api-integration-$Timestamp"
} -Body @{
  payload = @{
    leadId = "lead-$Timestamp"
    email = 'integration@example.com'
    source = 'demo_script'
  }
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)

Write-Host 'API integration execution accepted'
Write-Host ("Workspace: {0}" -f $Login.workspace.id)
Write-Host ("Workflow: {0}" -f $Published.workflow.publicId)
Write-Host ("Execution: {0}" -f $Accepted.execution.id)

$Accepted | ConvertTo-Json -Depth 32
