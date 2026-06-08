$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL.TrimEnd('/') } else { 'http://localhost:4600' }

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

Write-Host 'Runlane demo seed'
Write-Host "API: $ApiBaseUrl"

$Seed = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/demo/seed"

Write-Host 'Demo workspace ready'
Write-Host ("Workspace: {0}" -f $Seed.demo.workspace.id)
Write-Host ("User: {0}" -f $Seed.demo.credentials.email)
Write-Host ("API key prefix: {0}" -f $Seed.demo.apiKey.prefix)
Write-Host ("Seed version: {0}" -f $Seed.demo.seedVersion)
Write-Host 'Workflows:'
foreach ($Workflow in @($Seed.demo.workflows)) {
  Write-Host ("- {0} [{1}] {2}" -f $Workflow.name, $Workflow.triggerType, $Workflow.publicId)
}

$Seed | ConvertTo-Json -Depth 32
