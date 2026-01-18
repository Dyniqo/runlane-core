# Runlane Core

Runlane Core is a workflow orchestration platform built as a pnpm monorepo with independent NestJS API and Worker runtimes.

## Requirements

- Node.js 24.16.0
- pnpm 10.0.0
- Docker Engine with Docker Compose

## Install

```bash
pnpm install --frozen-lockfile --fetch-retries=10
```

## Configuration

The API and Worker load `.env.local` first and `.env` second without overriding variables already provided by the operating system. Local defaults provide runtime values when no environment file is present. PostgreSQL and Redis must be available before either runtime starts.

Use `.env.example` as the complete local configuration reference. Use `.env.deploy.example` as the deployment configuration reference. The local `.env` file remains excluded from version control. The deploy runtime profile requires explicit public URLs and datastore connection URLs and stops during startup when they are missing or invalid.

## Database

Start the datastore services and apply all committed migrations:

```bash
pnpm docker:infra:up
```

Create a migration after changing `prisma/schema.prisma`:

```bash
pnpm db:migrate:create -- --name migration_name
```

Apply migrations to an existing database:

```bash
pnpm db:migrate:deploy
```

Validate the schema and migration state:

```bash
pnpm db:validate
pnpm db:migrate:status
```

## Run locally

```bash
pnpm docker:infra:up
pnpm start:api:dev
pnpm start:worker:dev
```

The local API listens on `http://localhost:4600` and the local Worker runtime listens on `http://localhost:4601`.

## Run with Docker

```bash
pnpm docker:up
```

The Docker API listens on `http://127.0.0.1:14600`. PostgreSQL and Redis are bound to loopback on ports `15432` and `16379`. The Worker runtime is available only inside the Docker network.

Docker host ports can be changed with `RUNLANE_API_PORT`, `RUNLANE_POSTGRES_PORT`, and `RUNLANE_REDIS_PORT` without changing container ports. Public runtime URLs can be changed with `RUNLANE_PUBLIC_API_URL` and `RUNLANE_PUBLIC_APP_URL`. The Compose project namespace can be changed with `RUNLANE_COMPOSE_PROJECT_NAME`.

## Runtime observability

API and Worker logs are emitted as structured JSON. Every HTTP response includes `x-request-id` and `x-correlation-id`. Valid incoming values are preserved and missing or invalid values are replaced with generated identifiers. Sensitive values are redacted before logs are written.

Runtime shutdown is coordinated for `SIGINT`, `SIGTERM`, uncaught exceptions, and unhandled rejections. `SHUTDOWN_TIMEOUT_MS` controls the maximum graceful shutdown duration.

## Docker operations

```bash
pnpm docker:config
pnpm docker:infra:up
pnpm docker:migrate
pnpm docker:up:detached
pnpm docker:logs
pnpm docker:down
pnpm docker:reset
```

## Validate

```bash
pnpm verify
pnpm docker:config
powershell -ExecutionPolicy Bypass -File scripts/validate-database.ps1
```

## Run built services

```bash
pnpm build
pnpm start:api:built
pnpm start:worker:built
```
