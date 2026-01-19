param(
  [string]$ApiUrl = 'http://localhost:4600',
  [string]$WorkerUrl = 'http://localhost:4601'
)

$ErrorActionPreference = 'Stop'
$env:RUNLANE_VALIDATION_API_URL = $ApiUrl
$env:RUNLANE_VALIDATION_WORKER_URL = $WorkerUrl

pnpm validate:runtime

if ($LASTEXITCODE -ne 0) {
  throw 'Operational endpoint validation failed.'
}
