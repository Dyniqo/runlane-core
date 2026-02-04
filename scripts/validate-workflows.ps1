$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL } else { 'http://localhost:4600' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Email = "runlane.workflow.$Timestamp@example.com"
$OtherEmail = "runlane.workflow.other.$Timestamp@example.com"
$Password = 'RunlanePassword123!'
$Name = 'Runlane Workflow Operator'

function Invoke-JsonRequest {
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

  if ($PSBoundParameters.ContainsKey('Body') -and $null -ne $Body) {
    $Parameters.Body = ($Body | ConvertTo-Json -Depth 32 -Compress)
    $Parameters.ContentType = 'application/json'
  }

  Invoke-RestMethod @Parameters
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)] [AllowNull()] [object] $Actual,
    [Parameter(Mandatory = $true)] [AllowNull()] [object] $Expected,
    [Parameter(Mandatory = $true)] [string] $Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected' but received '$Actual'."
  }
}

function Invoke-ExpectedFailure {
  param(
    [Parameter(Mandatory = $true)] [scriptblock] $Operation,
    [Parameter(Mandatory = $true)] [int] $StatusCode
  )

  try {
    & $Operation | Out-Null
  } catch {
    $Response = $_.Exception.Response

    if ($null -eq $Response) {
      throw
    }

    if ([int] $Response.StatusCode -ne $StatusCode) {
      throw "Expected HTTP $StatusCode but received $([int] $Response.StatusCode)."
    }

    return
  }

  throw "Expected request failure with HTTP $StatusCode."
}

function New-WorkflowDefinition {
  param(
    [Parameter(Mandatory = $true)] [string] $EntryStepKey,
    [Parameter(Mandatory = $true)] [array] $Steps
  )

  @{
    schemaVersion = 1
    trigger = @{
      type = 'webhook'
      config = @{}
    }
    entryStepKey = $EntryStepKey
    steps = $Steps
  }
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $Email
  password = $Password
  name = $Name
} | Out-Null

$Login = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $Email
  password = $Password
}

$Headers = @{ Authorization = "Bearer $($Login.tokens.accessToken)" }
$CreateDefinition = New-WorkflowDefinition -EntryStepKey 'qualify_lead' -Steps @(
  @{
    key = 'qualify_lead'
    name = 'Qualify lead'
    type = 'condition'
    config = @{
      expression = 'payload.email != null'
    }
    transitions = @{
      branches = @{
        qualified = 'notify_team'
      }
      onFailure = 'notify_failure'
    }
  },
  @{
    key = 'notify_team'
    name = 'Notify team'
    type = 'notification'
    config = @{
      channel = 'operations'
    }
  },
  @{
    key = 'notify_failure'
    name = 'Notify failure'
    type = 'notification'
    config = @{
      channel = 'operations'
    }
  }
)

$Created = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $Headers -Body @{
  name = 'AI lead routing'
  triggerType = 'webhook'
  definition = $CreateDefinition
}
Assert-Equal -Actual $Created.workflow.name -Expected 'AI lead routing' -Message 'Workflow name mismatch.'
Assert-Equal -Actual $Created.workflow.workspaceId -Expected $Login.workspace.id -Message 'Workflow workspace mismatch.'
Assert-Equal -Actual $Created.workflow.status -Expected 'draft' -Message 'Workflow status mismatch.'
Assert-Equal -Actual $Created.workflow.version -Expected 1 -Message 'Workflow version mismatch.'
Assert-Equal -Actual $Created.workflow.triggerType -Expected 'webhook' -Message 'Workflow trigger type mismatch.'
Assert-Equal -Actual $Created.workflow.definition.schemaVersion -Expected 1 -Message 'Workflow definition schema version mismatch.'
Assert-Equal -Actual $Created.workflow.definition.entryStepKey -Expected 'qualify_lead' -Message 'Workflow entry step mismatch.'

$List = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workflows" -Headers $Headers
$Listed = @($List.items | Where-Object { $_.id -eq $Created.workflow.id })

if ($Listed.Count -ne 1) {
  throw 'Created workflow was not returned by the workspace-scoped list endpoint.'
}

$Read = Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workflows/$($Created.workflow.id)" -Headers $Headers
Assert-Equal -Actual $Read.workflow.id -Expected $Created.workflow.id -Message 'Workflow read id mismatch.'

$UpdatedDefinition = New-WorkflowDefinition -EntryStepKey 'qualify_lead' -Steps @(
  @{
    key = 'qualify_lead'
    name = 'Qualify lead'
    type = 'condition'
    config = @{
      expression = 'payload.score >= 80'
    }
    timeoutMs = 5000
    transitions = @{
      onSuccess = 'notify_team'
      onFailure = 'notify_failure'
    }
  },
  @{
    key = 'notify_team'
    name = 'Notify team'
    type = 'notification'
    config = @{
      channel = 'sales'
    }
  },
  @{
    key = 'notify_failure'
    name = 'Notify failure'
    type = 'notification'
    config = @{
      channel = 'ops'
    }
  }
)

$Updated = Invoke-JsonRequest -Method Patch -Uri "$ApiBaseUrl/v1/workflows/$($Created.workflow.id)" -Headers $Headers -Body @{
  name = 'Qualified lead routing'
  definition = $UpdatedDefinition
}
Assert-Equal -Actual $Updated.workflow.name -Expected 'Qualified lead routing' -Message 'Workflow update name mismatch.'
Assert-Equal -Actual $Updated.workflow.status -Expected 'draft' -Message 'Workflow update status mismatch.'
Assert-Equal -Actual $Updated.workflow.version -Expected 2 -Message 'Workflow update version mismatch.'

Invoke-ExpectedFailure -StatusCode 400 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows" -Headers $Headers -Body @{
    name = 'Invalid schema workflow'
    triggerType = 'webhook'
    definition = @{
      schemaVersion = 1
      trigger = @{
        type = 'webhook'
        config = @{}
      }
      entryStepKey = 'missing_step'
      steps = @()
    }
  }
}

$Published = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Created.workflow.id)/publish" -Headers $Headers
Assert-Equal -Actual $Published.workflow.status -Expected 'published' -Message 'Workflow publish status mismatch.'
Assert-Equal -Actual $Published.workflow.version -Expected 2 -Message 'Workflow publish version mismatch.'

if ([string]::IsNullOrWhiteSpace($Published.workflow.publishedAt)) {
  throw 'Published workflow did not include publishedAt.'
}

Invoke-ExpectedFailure -StatusCode 409 -Operation {
  Invoke-JsonRequest -Method Patch -Uri "$ApiBaseUrl/v1/workflows/$($Created.workflow.id)" -Headers $Headers -Body @{
    name = 'Published workflow update'
  }
}

Invoke-ExpectedFailure -StatusCode 401 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workflows"
}

Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/register" -Body @{
  email = $OtherEmail
  password = $Password
  name = 'Other Workflow Operator'
} | Out-Null

$OtherLogin = Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/auth/login" -Body @{
  email = $OtherEmail
  password = $Password
}
$OtherHeaders = @{ Authorization = "Bearer $($OtherLogin.tokens.accessToken)" }

Invoke-ExpectedFailure -StatusCode 403 -Operation {
  Invoke-JsonRequest -Method Get -Uri "$ApiBaseUrl/v1/workflows/$($Created.workflow.id)" -Headers $OtherHeaders
}

Invoke-ExpectedFailure -StatusCode 403 -Operation {
  Invoke-JsonRequest -Method Post -Uri "$ApiBaseUrl/v1/workflows/$($Created.workflow.id)/publish" -Headers $OtherHeaders
}

node scripts/validate-workflow-database.mjs $Email $Created.workflow.id

Write-Host "Workflow validation completed for $Email"
