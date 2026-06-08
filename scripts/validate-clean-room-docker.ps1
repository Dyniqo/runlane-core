param(
    [string]$ProjectName = "runlane-clean-room-$([Guid]::NewGuid().ToString('N').Substring(0, 12))",
    [string]$ApiUrl = 'http://127.0.0.1:14600'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Invoke-Checked {
    param([string[]]$Command)
    & $Command[0] @($Command | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE: $($Command -join ' ')"
    }
}

function Show-Diagnostics {
    Write-Host '--- Docker Compose status ---'
    & docker compose -p $ProjectName ps
    Write-Host '--- Docker Compose logs ---'
    & docker compose -p $ProjectName logs --tail 160 postgres redis migrator api worker
}

$cleanupRequired = $false

try {
    Write-Step 'Checking Docker availability'
    Invoke-Checked @('docker', 'version')
    Invoke-Checked @('docker', 'compose', 'version')

    Write-Step 'Running repository verification'
    Invoke-Checked @('pnpm', 'verify')

    Write-Step "Removing previous clean-room namespace $ProjectName"
    & docker compose -p $ProjectName down --volumes --remove-orphans | Out-Host

    Write-Step 'Building clean-room Docker images'
    Invoke-Checked @('docker', 'compose', '-p', $ProjectName, 'build', '--pull')

    $cleanupRequired = $true

    Write-Step 'Starting datastores and migrator'
    Invoke-Checked @('docker', 'compose', '-p', $ProjectName, 'up', '--detach', 'postgres', 'redis', 'migrator')

    Write-Step 'Starting API and Worker'
    Invoke-Checked @('docker', 'compose', '-p', $ProjectName, 'up', '--detach', 'api', 'worker')

    Write-Step 'Waiting for API readiness'
    $apiReady = $false
    for ($attempt = 1; $attempt -le 36; $attempt++) {
        try {
            Invoke-RestMethod -Method Get -Uri "$ApiUrl/health/ready" -TimeoutSec 5 | Out-Null
            $apiReady = $true
            break
        } catch {
            Start-Sleep -Seconds 5
        }
    }

    if (-not $apiReady) {
        Show-Diagnostics
        throw 'API readiness check did not complete successfully'
    }

    Write-Step 'Checking Worker readiness from inside the Compose network'
    $workerCheck = "node -e \"fetch('http://worker:4601/health/ready').then((r)=>{if(!r.ok)process.exit(1);}).catch(()=>process.exit(1));\""
    Invoke-Checked @('docker', 'compose', '-p', $ProjectName, 'exec', '-T', 'worker', 'sh', '-lc', $workerCheck)

    Write-Step 'Clean-room Docker validation completed'
} catch {
    if ($cleanupRequired) {
        Show-Diagnostics
    }
    throw
} finally {
    Write-Step "Cleaning clean-room namespace $ProjectName"
    & docker compose -p $ProjectName down --volumes --remove-orphans | Out-Host
}
