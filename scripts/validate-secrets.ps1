$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.secrets.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$SecretValue = "workflow-secret-$Timestamp"
$CredentialValue = "connector-credential-$Timestamp"

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
  name = 'Runlane Secret Operator'
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$AuthHeaders = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$ApiKey = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/api-keys" -Headers $AuthHeaders -Body @{
  name = "Secret validation key $Timestamp"
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
        pass = $true
        secretToken = '{{ secrets.routing_token }}'
      }
    }
  )
}

$Workflow = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $AuthHeaders -Body @{
  name = "Secret validation workflow $Timestamp"
  triggerType = 'automation'
  definition = $Definition
}

$Secret = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/secrets" -Headers $AuthHeaders -Body @{
  key = 'routing_token'
  value = $SecretValue
}

if ($Secret.secret.maskedValue -ne '********') {
  throw 'Workflow secret response did not mask the secret value.'
}

$Secrets = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/secrets" -Headers $AuthHeaders
$StoredSecret = @($Secrets.items | Where-Object { $_.key -eq 'routing_token' })

if ($StoredSecret.Count -ne 1 -or $StoredSecret[0].maskedValue -ne '********') {
  throw 'Workflow secret listing did not return the expected masked secret.'
}

$Credential = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/connector-credentials" -Headers $AuthHeaders -Body @{
  name = 'primary_crm'
  type = 'bearer_token'
  value = $CredentialValue
  metadata = @{
    provider = 'crm'
    headerName = 'Authorization'
  }
}

if ($Credential.credential.maskedValue -ne '********') {
  throw 'Connector credential response did not mask the credential value.'
}

$Credentials = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/connector-credentials" -Headers $AuthHeaders
$StoredCredential = @($Credentials.items | Where-Object { $_.name -eq 'primary_crm' })

if ($StoredCredential.Count -ne 1 -or $StoredCredential[0].maskedValue -ne '********') {
  throw 'Connector credential listing did not return the expected masked credential.'
}

$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Workflow.workflow.id)/publish" -Headers $AuthHeaders
$Accepted = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($Published.workflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $ApiKey.token
  'X-Runlane-Source' = 'secret_validation'
  'X-Runlane-Idempotency-Key' = "secrets-$Timestamp"
} -Body @{
  payload = @{
    routing = @{
      branch = 'secure'
    }
  }
}

if ($Accepted.execution.status -ne 'queued') {
  throw 'Secret validation execution was not queued before worker processing.'
}

Invoke-NodeScript -Arguments @('scripts/wait-for-execution-job.mjs', $Accepted.execution.workspaceId, $Accepted.execution.id, $Accepted.execution.workflowId)
Invoke-NodeScript -Arguments @('scripts/validate-secrets-database.mjs', $Email, $Workflow.workflow.id, $Accepted.execution.id, $SecretValue, $CredentialValue)

Write-Host "Secret validation completed for $Email"
