Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess([string]$message) {
  if ($LASTEXITCODE -ne 0) {
    throw $message
  }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$databaseUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'runlane' }
$databaseName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'runlane' }

Push-Location $repositoryRoot

try {
  pnpm db:validate
  Assert-NativeSuccess 'Prisma schema validation failed.'

  pnpm db:generate
  Assert-NativeSuccess 'Prisma Client generation failed.'

  docker compose config --quiet
  Assert-NativeSuccess 'Docker Compose configuration validation failed.'

  docker compose up --detach --build postgres redis
  Assert-NativeSuccess 'Datastore services failed to start.'

  $databaseReady = $false

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker compose exec -T postgres pg_isready --username $databaseUser --dbname $databaseName

    if ($LASTEXITCODE -eq 0) {
      $databaseReady = $true
      break
    }

    Start-Sleep -Seconds 2
  }

  if (-not $databaseReady) {
    throw 'PostgreSQL did not become ready.'
  }

  docker compose run --rm --build --no-deps migrator
  Assert-NativeSuccess 'Database migration failed.'

  docker compose exec -T postgres psql --no-psqlrc --set ON_ERROR_STOP=1 --username $databaseUser --dbname $databaseName --command 'SELECT migration_name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations" ORDER BY started_at;'
  Assert-NativeSuccess 'Migration history validation failed.'

  docker compose exec -T postgres psql --no-psqlrc --set ON_ERROR_STOP=1 --username $databaseUser --dbname $databaseName --command "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users';"
  Assert-NativeSuccess 'Database schema validation failed.'

  $legacyTableCount = docker compose exec -T postgres psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --username $databaseUser --dbname $databaseName --command "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_runlane_bootstrap_migrations';"
  Assert-NativeSuccess 'Legacy migration marker validation failed.'

  if (($legacyTableCount | Out-String).Trim() -ne '0') {
    throw 'Legacy migration marker was not removed.'
  }

  pnpm db:migrate:status
  Assert-NativeSuccess 'Migration status validation failed.'
} finally {
  Pop-Location
}
