$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:RUNLANE_API_BASE_URL) { $env:RUNLANE_API_BASE_URL.TrimEnd('/') } else { 'http://localhost:4600' }
$WebhookSigningSecret = if ($env:WEBHOOK_SIGNING_SECRET) { $env:WEBHOOK_SIGNING_SECRET } else { 'runlane_local_webhook_signing_secret_change_me_64_bytes_minimum_value' }
$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

function Invoke-RunlaneJsonRequest {
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

  if ($null -ne $Body) {
    $Parameters.Body = ($Body | ConvertTo-Json -Depth 32 -Compress)
    $Parameters.ContentType = 'application/json'
  }

  Invoke-RestMethod @Parameters
}

function Convert-ToHex {
  param([Parameter(Mandatory = $true)] [byte[]] $Bytes)

  ($Bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

function ConvertTo-StableJson {
  param([AllowNull()] [object] $Value)

  if ($null -eq $Value) {
    return 'null'
  }

  if ($Value -is [string]) {
    return ($Value | ConvertTo-Json -Compress)
  }

  if ($Value -is [bool]) {
    if ($Value) { return 'true' }
    return 'false'
  }

  if ($Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int] -or $Value -is [uint32] -or $Value -is [long] -or $Value -is [uint64] -or $Value -is [float] -or $Value -is [double] -or $Value -is [decimal]) {
    return ([System.Convert]::ToString($Value, [System.Globalization.CultureInfo]::InvariantCulture))
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $Entries = @()
    foreach ($Key in @($Value.Keys | ForEach-Object { [string] $_ } | Sort-Object)) {
      $Entries += "$(ConvertTo-StableJson $Key):$(ConvertTo-StableJson $Value[$Key])"
    }
    return "{$($Entries -join ',')}"
  }

  if ($Value -is [System.Collections.IEnumerable]) {
    $Items = @()
    foreach ($Item in $Value) {
      $Items += ConvertTo-StableJson $Item
    }
    return "[$($Items -join ',')]"
  }

  $Properties = @{}
  foreach ($Property in $Value.PSObject.Properties) {
    $Properties[$Property.Name] = $Property.Value
  }

  ConvertTo-StableJson $Properties
}

function New-RunlaneWebhookSignature {
  param([Parameter(Mandatory = $true)] [object] $Payload)

  $TimestampSeconds = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $PayloadJson = ConvertTo-StableJson $Payload
  $Sha256 = [System.Security.Cryptography.SHA256]::Create()
  $PayloadHash = Convert-ToHex $Sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($PayloadJson))
  $SignedPayload = "$TimestampSeconds.$PayloadHash"
  $Hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($WebhookSigningSecret))
  $Digest = Convert-ToHex $Hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($SignedPayload))

  "t=$TimestampSeconds,v1=$Digest"
}

Write-Host 'Runlane AI lead routing demo'
Write-Host "API: $ApiBaseUrl"

$Seed = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/demo/seed"
$LeadWorkflow = @($Seed.demo.workflows | Where-Object { $_.triggerType -eq 'webhook' } | Select-Object -First 1)[0]

if ($null -eq $LeadWorkflow) {
  throw 'Demo seed did not return a webhook workflow.'
}

$Payload = @{
  leadId = "lead-$Timestamp"
  name = 'Ada Lovelace'
  email = 'ada@example.com'
  company = 'Analytical Engines'
  budget = '12000'
  message = 'We need a reliable automation backend for inbound lead qualification and routing.'
}

$Response = Invoke-RunlaneJsonRequest -Method Post -Uri "$ApiBaseUrl/v1/hooks/$($LeadWorkflow.publicId)" -Headers @{
  'X-Runlane-Source' = 'demo_script'
  'X-Runlane-Idempotency-Key' = "lead-$Timestamp"
  'X-Runlane-Signature' = (New-RunlaneWebhookSignature -Payload $Payload)
} -Body $Payload

Write-Host 'Lead webhook accepted'
Write-Host ("Workflow: {0}" -f $LeadWorkflow.publicId)
Write-Host ("Execution: {0}" -f $Response.execution.id)
Write-Host ("Status: {0}" -f $Response.execution.status)

$Response | ConvertTo-Json -Depth 32
