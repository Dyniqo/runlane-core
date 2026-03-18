$ErrorActionPreference = 'Stop'

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.http.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$LeadId = "lead-$Timestamp"
$CredentialValue = "http-credential-$Timestamp"

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

function Get-HttpEchoBodyPath {
  param([Parameter(Mandatory = $true)] [object] $Probe)

  if ($null -ne $Probe.json -and $Probe.json.leadId -eq $LeadId) {
    return 'json'
  }

  if ($null -ne $Probe.parsedBody -and $Probe.parsedBody.leadId -eq $LeadId) {
    return 'parsedBody'
  }

  return $null
}

function Test-HttpEchoEndpoint {
  param([Parameter(Mandatory = $true)] [string] $Url)

  try {
    $Probe = Invoke-JsonRequest -Method Post -Uri $Url -TimeoutSec 10 -Headers @{
      'X-Runlane-Validation-Probe' = "probe-$Timestamp"
    } -Body @{
      leadId = $LeadId
      source = 'runlane_validation_probe'
    }

    if ($null -eq $Probe) {
      return $null
    }

    $BodyPath = Get-HttpEchoBodyPath -Probe $Probe

    if (-not $BodyPath) {
      return $null
    }

    New-Object -TypeName PSObject -Property @{
      Url = $Url
      BodyPath = $BodyPath
    }
  } catch {
    return $null
  }
}

function Resolve-HttpEchoEndpoint {
  if ($env:RUNLANE_HTTP_CONNECTOR_TEST_URL) {
    $ConfiguredEndpoint = Test-HttpEchoEndpoint -Url $env:RUNLANE_HTTP_CONNECTOR_TEST_URL

    if ($null -ne $ConfiguredEndpoint) {
      return $ConfiguredEndpoint
    }

    throw "RUNLANE_HTTP_CONNECTOR_TEST_URL is not reachable from PowerShell or does not echo JSON under a supported response field: $($env:RUNLANE_HTTP_CONNECTOR_TEST_URL)"
  }

  $Candidates = @(
    'https://echo.free.beeceptor.com',
    'https://postman-echo.com/post',
    'https://httpbingo.org/post',
    'https://httpbin.org/post'
  )

  foreach ($Candidate in $Candidates) {
    $Endpoint = Test-HttpEchoEndpoint -Url $Candidate

    if ($null -ne $Endpoint) {
      return $Endpoint
    }
  }

  throw 'No configured HTTP connector validation endpoint is reachable. Set RUNLANE_HTTP_CONNECTOR_TEST_URL to a public POST echo endpoint that returns the submitted JSON under json or parsedBody, add its origin to HTTP_CONNECTOR_DEMO_URL_ALLOWLIST, then restart the API and Worker runtimes.'
}

$HttpEndpoint = Resolve-HttpEchoEndpoint
$HttpTestUrl = $HttpEndpoint.Url
$HttpResponseBodyPath = $HttpEndpoint.BodyPath

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = 'Runlane HTTP Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "HTTP validation key $Timestamp"
}

$SuccessDefinition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'send_lead'
  steps = @(
    @{
      key = 'send_lead'
      name = 'Send lead to HTTP endpoint'
      type = 'http'
      timeoutMs = 15000
      config = @{
        request = @{
          method = 'POST'
          url = $HttpTestUrl
          query = @{
            source = 'runlane'
          }
          headers = @{
            'X-Runlane-Trace' = '{{ payload.trace }}'
          }
          bodyType = 'json'
          body = @{
            leadId = '{{ payload.lead.id }}'
            email = '{{ payload.lead.email }}'
            tier = '{{ payload.routing.tier }}'
          }
        }
        auth = @{
          mode = 'custom_header'
          credentialName = 'http_echo_header'
          name = 'X-Runlane-Connector-Key'
        }
        response = @{
          successStatusCodes = @(200)
          retryStatusCodes = @(408, 425, 429, 500, 502, 503, 504)
          bodyPath = $HttpResponseBodyPath
          includeHeaders = $false
          maxBodyBytes = 65536
        }
      }
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "HTTP connector workflow $Timestamp"
  triggerType = 'automation'
  definition = $SuccessDefinition
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/connector-credentials" -Headers $AuthHeaders -Body @{
  name = 'http_echo_header'
  type = 'custom_header'
  value = $CredentialValue
  metadata = @{
    provider = 'http_echo'
    headerName = 'X-Runlane-Connector-Key'
  }
} | Out-Null

$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'http_connector_validation'
  'X-Runlane-Idempotency-Key' = "http-success-$Timestamp"
} -Body @{
  payload = @{
    trace = "trace-$Timestamp"
    lead = @{
      id = $LeadId
      email = 'ada@example.com'
    }
    routing = @{
      tier = 'priority'
    }
  }
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'HTTP connector success execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)

$BlockedDefinition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'blocked_request'
  steps = @(
    @{
      key = 'blocked_request'
      name = 'Reject blocked HTTP target'
      type = 'http'
      timeoutMs = 5000
      config = @{
        request = @{
          method = 'GET'
          url = 'http://127.0.0.1:4600/health'
        }
        auth = @{
          mode = 'none'
        }
        response = @{
          successStatusCodes = @(200)
          retryStatusCodes = @(408, 425, 429, 500, 502, 503, 504)
          includeHeaders = $false
          maxBodyBytes = 32768
        }
      }
    }
  )
}

$BlockedWorkflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "HTTP connector blocked workflow $Timestamp"
  triggerType = 'automation'
  definition = $BlockedDefinition
}

$BlockedPublished = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($BlockedWorkflow.workflow.id)/publish" -Headers $AuthHeaders
$BlockedAccepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($BlockedPublished.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'http_connector_validation'
  'X-Runlane-Idempotency-Key' = "http-blocked-$Timestamp"
} -Body @{
  payload = @{
    trace = "blocked-$Timestamp"
  }
}

if ($BlockedAccepted.execution.status -ne 'queued') {
  throw 'HTTP connector blocked execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $BlockedAccepted.execution.workspaceId, $BlockedAccepted.execution.id, $BlockedAccepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-http-connector-database.mjs', $Email, $Accepted.execution.id, $BlockedAccepted.execution.id, $LeadId, $CredentialValue)

Write-Host "HTTP connector validation completed for $Email using $HttpTestUrl"
