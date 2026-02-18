$ErrorActionPreference = 'Stop'

pnpm validate:webhooks
pnpm validate:automation

Write-Host 'Execution creation validation completed'
