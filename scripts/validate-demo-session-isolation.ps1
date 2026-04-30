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
    [Parameter(Mandatory = $true)][string]$Message,
    [object]$Details = $null
  )

  if (-not $Condition) {
    if ($null -ne $Details) {
      Write-Host ($Details | ConvertTo-Json -Depth 30)
    }
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

  if ($Value -is [System.Array]) {
    return @($Value)
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

function Read-WorkspaceItems {
  param(
    [Parameter(Mandatory = $true)][object]$Response
  )

  if ($null -ne $Response.items) {
    return ConvertTo-RunlaneArray -Value $Response.items
  }

  return @()
}

function Read-PublicIdSet {
  param(
    [Parameter(Mandatory = $true)][array]$Workflows
  )

  $ids = @()
  foreach ($workflow in $Workflows) {
    $ids += [string]$workflow.publicId
  }

  return [string]::Join(",", ($ids | Sort-Object))
}

$stamp = [int64](([DateTime]::UtcNow - [DateTime]'1970-01-01T00:00:00Z').TotalMilliseconds)
$demoSessionA = "validate-session-a-$stamp"
$demoSessionB = "validate-session-b-$stamp"

Write-Host "Seeding canonical demo workspace through $baseUrl"
$seed = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/demo/seed"
Assert-Value -Condition ($seed.demo.enabled -eq $true) -Message "Demo seed did not report enabled=true"

Write-Host "Logging into isolated demo session A"
$loginA = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/auth/login" -Body @{
  email = $seed.demo.credentials.email
  password = $seed.demo.credentials.password
  demoSessionId = $demoSessionA
}
$tokenA = $loginA.tokens.accessToken
$refreshA = $loginA.tokens.refreshToken
Assert-Value -Condition (-not [string]::IsNullOrWhiteSpace($tokenA)) -Message "Demo session A did not return an access token"

Write-Host "Logging into isolated demo session B"
$loginB = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/auth/login" -Body @{
  email = $seed.demo.credentials.email
  password = $seed.demo.credentials.password
  demoSessionId = $demoSessionB
}
$tokenB = $loginB.tokens.accessToken
Assert-Value -Condition (-not [string]::IsNullOrWhiteSpace($tokenB)) -Message "Demo session B did not return an access token"

Assert-Value -Condition ($loginA.workspace.id -ne $seed.demo.workspace.id) -Message "Demo session A resolved to the canonical seed workspace"
Assert-Value -Condition ($loginB.workspace.id -ne $seed.demo.workspace.id) -Message "Demo session B resolved to the canonical seed workspace"
Assert-Value -Condition ($loginA.workspace.id -ne $loginB.workspace.id) -Message "Demo sessions resolved to the same workspace"

$headersA = @{ Authorization = "Bearer $tokenA" }
$headersB = @{ Authorization = "Bearer $tokenB" }

Write-Host "Reading session-scoped workflow lists"
$workflowsA = @(Read-WorkflowItems -Response (Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/workflows" -Headers $headersA))
$workflowsB = @(Read-WorkflowItems -Response (Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/workflows" -Headers $headersB))
Assert-Value -Condition ($workflowsA.Count -ge 2) -Message "Demo session A does not include cloned workflows" -Details $workflowsA
Assert-Value -Condition ($workflowsB.Count -ge 2) -Message "Demo session B does not include cloned workflows" -Details $workflowsB
Assert-Value -Condition ((Read-PublicIdSet -Workflows $workflowsA) -ne (Read-PublicIdSet -Workflows $workflowsB)) -Message "Demo sessions received identical workflow public ids"

Write-Host "Checking workspace list isolation"
$workspaceResponseA = Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/workspaces" -Headers $headersA
$workspaceResponseB = Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/workspaces" -Headers $headersB
$workspacesA = @(Read-WorkspaceItems -Response $workspaceResponseA)
$workspacesB = @(Read-WorkspaceItems -Response $workspaceResponseB)
Assert-Value -Condition ($workspacesA.Count -eq 1) -Message "Demo session A can see more than one workspace" -Details $workspaceResponseA
Assert-Value -Condition ($workspacesB.Count -eq 1) -Message "Demo session B can see more than one workspace" -Details $workspaceResponseB
Assert-Value -Condition ($workspacesA[0].id -eq $loginA.workspace.id) -Message "Demo session A workspace list is not scoped to its workspace" -Details $workspaceResponseA
Assert-Value -Condition ($workspacesB[0].id -eq $loginB.workspace.id) -Message "Demo session B workspace list is not scoped to its workspace" -Details $workspaceResponseB

Write-Host "Checking refresh token preserves the session workspace"
$refreshResponseA = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/auth/refresh" -Body @{
  refreshToken = $refreshA
}
Assert-Value -Condition ($refreshResponseA.workspace.id -eq $loginA.workspace.id) -Message "Demo session refresh did not preserve the workspace"
$refreshedTokenA = $refreshResponseA.tokens.accessToken
$headersRefreshedA = @{ Authorization = "Bearer $refreshedTokenA" }
$meA = Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/auth/me" -Headers $headersRefreshedA
Assert-Value -Condition ($meA.workspace.id -eq $loginA.workspace.id) -Message "Authenticated user lookup did not preserve the demo session workspace"

Write-Host "Resetting session A without affecting session B"
$beforeResetB = Read-PublicIdSet -Workflows $workflowsB
$resetA = Invoke-RunlaneJsonRequest -Method "Post" -Url "$baseUrl/v1/demo/reset" -Headers $headersRefreshedA
Assert-Value -Condition ($resetA.reset -eq $true) -Message "Demo session reset did not report reset=true"
Assert-Value -Condition ($resetA.demo.workspace.id -eq $loginA.workspace.id) -Message "Demo session reset returned an unexpected workspace"
$afterResetBWorkflows = @(Read-WorkflowItems -Response (Invoke-RunlaneJsonRequest -Method "Get" -Url "$baseUrl/v1/workflows" -Headers $headersB))
$afterResetB = Read-PublicIdSet -Workflows $afterResetBWorkflows
Assert-Value -Condition ($afterResetB -eq $beforeResetB) -Message "Resetting session A changed session B workflow state"

Write-Host "Demo session isolation validation completed"
Write-Host ("Session A Workspace: " + $loginA.workspace.id)
Write-Host ("Session B Workspace: " + $loginB.workspace.id)
Write-Host ("Session A Workflows: " + $workflowsA.Count)
Write-Host ("Session B Workflows: " + $workflowsB.Count)
