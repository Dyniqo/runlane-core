$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL.TrimEnd('/') } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

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

Write-Host 'Runlane automation bridge demo'
Write-Host "API: $ApiBaseUrl"

$Seed = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/demo/seed"
$AutomationWorkflow = @($Seed.demo.workflows | Where-Object { $_.triggerType -eq 'automation' } | Select-Object -First 1)[0]

if ($null -eq $AutomationWorkflow) {
  throw 'Demo seed did not return an automation workflow.'
}

$Response = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/automation/execute/$($AutomationWorkflow.publicId)" -Headers @{
  'X-Runlane-Api-Key' = $Seed.demo.credentials.apiKey
  'X-Runlane-Source' = 'n8n'
  'X-Runlane-Idempotency-Key' = "automation-$Timestamp"
} -Body @{
  payload = @{
    source = 'n8n'
    event = 'lead.created'
    payload = @{
      leadId = "lead-$Timestamp"
      email = 'grace@example.com'
      company = 'Compiler Labs'
    }
  }
}

Write-Host 'Automation bridge request accepted'
Write-Host ("Workflow: {0}" -f $AutomationWorkflow.publicId)
Write-Host ("Request: {0}" -f $Response.automationRequest.id)
Write-Host ("Execution: {0}" -f $Response.execution.id)
Write-Host ("Status: {0}" -f $Response.execution.status)

$Response | ConvertTo-Json -Depth 32
