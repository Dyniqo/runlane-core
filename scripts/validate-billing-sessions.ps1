$ErrorActionPreference = 'Stop'

node scripts/validate-billing-sessions.mjs
if ($LASTEXITCODE -ne 0) {
  throw ('Node script failed with exit code {0}: node scripts/validate-billing-sessions.mjs' -f $LASTEXITCODE)
}
