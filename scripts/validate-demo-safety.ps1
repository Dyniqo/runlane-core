$ErrorActionPreference = "Stop"

$baseUrl = $env:RUNLANE_API_URL
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  $baseUrl = $env:RUNLANE_API_BASE_URL
}
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  $baseUrl = "http://localhost:4600"
}
$baseUrl = $baseUrl.TrimEnd("/")

function Invoke-RunlaneJsonRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  $requestHeaders = @{}
  foreach ($key in $Headers.Keys) {
    $requestHeaders[$key] = $Headers[$key]
  }

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $requestHeaders
  }

  $jsonBody = $Body | ConvertTo-Json -Depth 30
  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $requestHeaders -ContentType "application/json" -Body $jsonBody
}

function Assert-Value {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function ConvertTo-RunlaneArray {
  param(
    [AllowNull()][object]$Value
  )

  if ($null -eq $Value) {
    return @()
  }

  return @($Value)
}

function Read-WorkflowItems {
  param(
    [Parameter(Mandatory = $true)][object]$Response
  )

  if ($null -ne $Response.items) {
    return ConvertTo-RunlaneArray -Value $Response.items
  }

  if ($null -ne $Response.workflows) {
    return ConvertTo-RunlaneArray -Value $Response.workflows
  }

  return @()
}

function Assert-WorkflowPublicIdsPresent {
  param(
    [Parameter(Mandatory = $true)][array]$ExpectedWorkflows,
    [Parameter(Mandatory = $true)][array]$ActualWorkflows,
    [Parameter(Mandatory = $true)][string]$Message
  )

  foreach ($expectedWorkflow in $ExpectedWorkflows) {
    $matched = @($ActualWorkflows | Where-Object { $_.publicId -eq $expectedWorkflow.publicId })
    if ($matched.Count -ne 1) {
      throw "$Message Missing workflow publicId '$($expectedWorkflow.publicId)'."
    }
  }
}

Write-Host "Seeding demo workspace through $baseUrl"
$seed = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/demo/seed"
$seedWorkflows = ConvertTo-RunlaneArray -Value $seed.demo.workflows
Assert-Value -Condition ($seed.demo.enabled -eq $true) -Message "Demo seed did not report enabled=true"
Assert-Value -Condition ($seedWorkflows.Count -ge 2) -Message "Demo seed did not create the expected workflows"
Assert-Value -Condition (-not [string]::IsNullOrWhiteSpace($seed.demo.credentials.email)) -Message "Demo seed did not return an email"
Assert-Value -Condition (-not [string]::IsNullOrWhiteSpace($seed.demo.credentials.password)) -Message "Demo seed did not return a password"
Assert-Value -Condition (-not [string]::IsNullOrWhiteSpace($seed.demo.credentials.apiKey)) -Message "Demo seed did not return an API key"

Write-Host "Logging into the seeded demo account"
$login = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/auth/login" -Body @{
  email = $seed.demo.credentials.email
  password = $seed.demo.credentials.password
}
$accessToken = $login.tokens.accessToken
Assert-Value -Condition (-not [string]::IsNullOrWhiteSpace($accessToken)) -Message "Demo login did not return an access token"
Assert-Value -Condition ($login.workspace.id -eq $seed.demo.workspace.id) -Message "Demo login resolved an unexpected workspace"

$authHeaders = @{
  Authorization = "Bearer $accessToken"
}

Write-Host "Reading demo workflows from the authenticated workspace"
$workflowResponse = Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/workflows" -Headers $authHeaders
$workflowItems = Read-WorkflowItems -Response $workflowResponse
Assert-Value -Condition ($workflowItems.Count -ge 2) -Message "Authenticated workflow list does not include seeded demo workflows"
Assert-WorkflowPublicIdsPresent -ExpectedWorkflows $seedWorkflows -ActualWorkflows $workflowItems -Message "Authenticated workflow list is missing a seeded workflow."

Write-Host "Resetting the current demo workspace"
$reset = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/demo/reset" -Headers $authHeaders
$resetWorkflows = ConvertTo-RunlaneArray -Value $reset.demo.workflows
Assert-Value -Condition ($reset.reset -eq $true) -Message "Demo reset did not report reset=true"
Assert-Value -Condition ($reset.demo.workspace.id -eq $seed.demo.workspace.id) -Message "Demo reset returned an unexpected workspace"
Assert-Value -Condition ($resetWorkflows.Count -ge 2) -Message "Demo reset did not restore demo workflows"

Write-Host "Reading demo workflows after reset"
$workflowResponseAfterReset = Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/workflows" -Headers $authHeaders
$workflowItemsAfterReset = Read-WorkflowItems -Response $workflowResponseAfterReset
Assert-Value -Condition ($workflowItemsAfterReset.Count -ge 2) -Message "Authenticated workflow list does not include reset demo workflows"
Assert-WorkflowPublicIdsPresent -ExpectedWorkflows $resetWorkflows -ActualWorkflows $workflowItemsAfterReset -Message "Authenticated workflow list after reset is missing a seeded workflow."

Write-Host "Demo validation completed"
Write-Host ("Workspace: " + $reset.demo.workspace.id)
Write-Host ("Workflows: " + $workflowItemsAfterReset.Count)
