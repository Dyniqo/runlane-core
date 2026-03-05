$ErrorActionPreference = 'Stop'

function Invoke-PnpmValidation {
  param([Parameter(Mandatory = $true)] [string] $ScriptName)

  & pnpm $ScriptName

  if ($LASTEXITCODE -ne 0) {
    throw ("Validation command failed with exit code {0}: pnpm {1}" -f $LASTEXITCODE, $ScriptName)
  }
}

Invoke-PnpmValidation -ScriptName 'validate:webhooks'
Invoke-PnpmValidation -ScriptName 'validate:automation'

Write-Host 'Execution creation validation completed'
