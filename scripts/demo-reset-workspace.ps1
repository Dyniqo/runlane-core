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

Write-Host 'Runlane demo reset'
Write-Host "API: $ApiBaseUrl"

$Seed = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/demo/seed"
$Login = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Seed.demo.credentials.email
  password = $Seed.demo.credentials.password
}

$Reset = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/demo/reset" -Headers @{
  Authorization = "Bearer $($Login.tokens.accessToken)"
}

Write-Host 'Demo workspace reset completed'
Write-Host ("Workspace: {0}" -f $Reset.demo.workspace.id)
Write-Host ("Workflows: {0}" -f @($Reset.demo.workflows).Count)

$Reset | ConvertTo-Json -Depth 32
