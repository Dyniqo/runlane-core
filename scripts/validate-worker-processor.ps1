$ErrorActionPreference = 'Stop'

$WorkerBaseUrl = if ($env:RUNLANE_WORKER_BASE_URL) { $env:RUNLANE_WORKER_BASE_URL } else { 'http://localhost:4601' }

$Readiness = Invoke-RestMethod -Method Get -Uri "$WorkerBaseUrl/health/ready"

if ($Readiness.status -ne 'ready') {
  throw "Worker readiness was expected to be ready but received '$($Readiness.status)'."
}

$QueueHealth = Invoke-RestMethod -Method Get -Uri "$WorkerBaseUrl/health/queue"

if ($QueueHealth.status -ne 'ready') {
  throw "Worker queue health was expected to be ready but received '$($QueueHealth.status)'."
}

node scripts/validate-worker-processor.mjs

Write-Host "Worker processor validation completed for $WorkerBaseUrl"
