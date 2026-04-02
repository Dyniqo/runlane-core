$ErrorActionPreference = 'Stop'

& node scripts/validate-plan-enforcement-api.mjs

if ($LASTEXITCODE -ne 0) {
  throw ('Node script failed with exit code {0}: node scripts/validate-plan-enforcement-api.mjs' -f $LASTEXITCODE)
}
