$ErrorActionPreference = 'Stop'

$Steps = @(
  @{ Name = 'Demo seed and reset'; Command = 'pnpm'; Arguments = @('validate:demo') },
  @{ Name = 'Demo session isolation'; Command = 'pnpm'; Arguments = @('validate:demo-isolation') },
  @{ Name = 'Webhook ingestion and queue handoff'; Command = 'pnpm'; Arguments = @('validate:webhooks') },
  @{ Name = 'Automation bridge and API key isolation'; Command = 'pnpm'; Arguments = @('validate:automation') },
  @{ Name = 'Usage metering and plan enforcement'; Command = 'pnpm'; Arguments = @('validate:usage') },
  @{ Name = 'Billing checkout and portal contracts'; Command = 'pnpm'; Arguments = @('validate:billing-sessions') }
)

Write-Host 'Runlane integration validation'
Write-Host 'API and Worker must be running before this command starts.'

foreach ($Step in $Steps) {
  Write-Host ''
  Write-Host ("==> {0}" -f $Step.Name)
  & $Step.Command @($Step.Arguments)

  if ($LASTEXITCODE -ne 0) {
    throw ("Integration validation failed during step: {0}" -f $Step.Name)
  }
}

Write-Host ''
Write-Host 'Runlane integration validation completed'
