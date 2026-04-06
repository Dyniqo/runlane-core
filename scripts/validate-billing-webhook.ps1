$ErrorActionPreference = 'Stop'

node scripts/validate-billing-webhook.mjs
if ($LASTEXITCODE -ne 0) {
  throw ('Node script failed with exit code {0}: node scripts/validate-billing-webhook.mjs' -f $LASTEXITCODE)
}
