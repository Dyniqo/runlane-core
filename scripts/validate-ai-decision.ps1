$ErrorActionPreference = 'Stop'

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.ai.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$LeadId = "lead-$Timestamp"

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

function Read-EnvValue {
  param([Parameter(Mandatory = $true)] [string] $Name)

  $ProcessValue = [Environment]::GetEnvironmentVariable($Name)

  if ($ProcessValue -and $ProcessValue.Trim().Length -gt 0) {
    return $ProcessValue.Trim()
  }

  $EnvFile = Join-Path (Get-Location) '.env'

  if (-not (Test-Path $EnvFile)) {
    return ''
  }

  foreach ($Line in Get-Content $EnvFile) {
    $Trimmed = $Line.Trim()

    if ($Trimmed.Length -eq 0 -or $Trimmed.StartsWith('#')) {
      continue
    }

    $Prefix = "$Name="

    if ($Trimmed.StartsWith($Prefix)) {
      return $Trimmed.Substring($Prefix.Length).Trim().Trim('"').Trim("'")
    }
  }

  ''
}

$ExpectedSuccess = 'false'
$ConfiguredAiKey = Read-EnvValue -Name 'AI_API_KEY'

if ($ConfiguredAiKey.Length -gt 0) {
  $ExpectedSuccess = 'true'
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = 'Runlane AI Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "AI decision validation key $Timestamp"
}

$Definition = @{
  schemaVersion = 1
  trigger = @{
    type = 'automation'
    config = @{}
  }
  entryStepKey = 'score_lead'
  steps = @(
    @{
      key = 'score_lead'
      name = 'Score lead with AI decision'
      type = 'ai_decision'
      timeoutMs = 45000
      config = @{
        messages = @(
          @{
            role = 'user'
            content = 'Return JSON only. Classify this lead. If budget is 10000 or higher, branch must be qualified. Otherwise branch must be nurture. Lead id={{ payload.lead.id }} email={{ payload.lead.email }} budget={{ payload.lead.budget }} company={{ payload.lead.company }}.'
          }
        )
        schema = @{
          type = 'object'
          additionalProperties = $false
          required = @('branch', 'score', 'reason')
          properties = @{
            branch = @{
              type = 'string'
              enum = @('qualified', 'nurture')
            }
            score = @{
              type = 'integer'
              minimum = 0
              maximum = 100
            }
            reason = @{
              type = 'string'
              minLength = 3
              maxLength = 240
            }
          }
        }
        temperature = 0
        maxOutputTokens = 240
        branchPath = 'branch'
      }
      transitions = @{
        branches = @{
          qualified = 'accepted_route'
          nurture = 'nurture_route'
        }
      }
    }
    @{
      key = 'accepted_route'
      name = 'Accepted routing branch'
      type = 'condition'
      config = @{
        branch = 'accepted'
        pass = $true
      }
    }
    @{
      key = 'nurture_route'
      name = 'Nurture routing branch'
      type = 'condition'
      config = @{
        branch = 'nurture'
        pass = $true
      }
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "AI decision workflow $Timestamp"
  triggerType = 'automation'
  definition = $Definition
}

$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'ai_decision_validation'
  'X-Runlane-Idempotency-Key' = "ai-decision-$Timestamp"
} -Body @{
  payload = @{
    lead = @{
      id = $LeadId
      email = 'ada@example.com'
      budget = 24000
      company = 'Runlane Validation'
    }
  }
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'AI decision execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-ai-decision-database.mjs', $Email, $Accepted.execution.id, $LeadId, $ExpectedSuccess)

if ($ExpectedSuccess -eq 'true') {
  Write-Host "AI decision validation completed for $Email with a configured provider"
} else {
  Write-Host "AI decision validation completed for $Email without local provider credentials; fail-fast path or externally configured provider path verified"
}
