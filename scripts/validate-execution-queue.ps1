$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$WorkerBaseUrl = if ($env:RUNLANE_WORKER_BASE_URL) { $env:RUNLANE_WORKER_BASE_URL } else { 'http://localhost:4601' }

function Assert-QueueReady {
  param(
    [Parameter(Mandatory = $true)] [string] $BaseUrl,
    [Parameter(Mandatory = $true)] [string] $ExpectedService
  )

  $Response = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health/queue"

  if ($Response.status -ne 'ready') {
    throw "Queue health for $ExpectedService was expected to be ready but received '$($Response.status)'."
  }

  if ($Response.service -ne $ExpectedService) {
    throw "Queue health service mismatch. Expected '$ExpectedService' but received '$($Response.service)'."
  }

  if ($Response.queue.status -ne 'up') {
    throw "Queue indicator for $ExpectedService was expected to be up but received '$($Response.queue.status)'."
  }

  if ($null -eq $Response.queue.latencyMs -or $Response.queue.latencyMs -lt 0) {
    throw "Queue health for $ExpectedService did not include a valid latency."
  }
}

Assert-QueueReady -BaseUrl $ApiBaseUrl -ExpectedService 'api'
Assert-QueueReady -BaseUrl $WorkerBaseUrl -ExpectedService 'worker'

Write-Host "Execution queue validation completed for $ApiBaseUrl and $WorkerBaseUrl"
