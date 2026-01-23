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

## Architecture boundaries

Runlane Core separates domain rules, application orchestration, infrastructure adapters, shared contracts, and runtime composition roots. The dependency direction is enforced during linting:

- Domain code remains independent from frameworks and outer layers.
- Application use cases depend only on domain rules and shared contracts.
- Infrastructure implements external-system adapters and may depend inward.
- API and Worker runtimes compose modules without accessing datastores directly.

Domain failures use stable machine-readable codes and semantic categories. The infrastructure exception boundary maps them to consistent HTTP responses without coupling domain code to HTTP concepts.

Application persistence contracts expose explicit read and write repository operations without depending on Prisma. Transactional use cases depend on the application transaction boundary, while infrastructure coordinates Prisma interactive transactions and transparently routes repository adapters through the active transaction context. Nested transaction calls reuse the active transaction and cannot override its options.

Shared contracts define stable transport shapes for jobs, events, DTOs, connector execution, workflow definitions, workspace scope, and Redis keys. Workspace-owned Redis keys can only be created through explicit builders that preserve tenant namespaces and reject unsafe key segments.

Identity registration is implemented as an application use case with explicit repository and password hashing ports. User creation, default workspace creation, and owner membership creation are committed in a single database transaction.

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
pnpm db:generate
pnpm docker:infra:up
pnpm db:migrate:deploy
pnpm start:api:dev
pnpm start:worker:dev
```

Generate the Prisma Client before starting either runtime. API and Worker start commands never regenerate the client, which allows both runtimes to run concurrently without replacing loaded native engine files.

The local API listens on `http://localhost:4600` and the local Worker runtime listens on `http://localhost:4601`.

## API and operational endpoints

The API uses URI versioning. The current API descriptor is available at `GET /v1`. OpenAPI documentation is available at `/docs` and the OpenAPI JSON document is available at `/docs/openapi.json` when `API_DOCS_ENABLED=true`.

Both runtimes expose unversioned operational endpoints:

- `GET /health`
- `GET /health/ready`
- `GET /health/queue`

Liveness does not query external dependencies. Readiness verifies PostgreSQL and Redis. Queue health verifies the Redis transport used by the queue boundary.

## Identity endpoints

The registration endpoint creates a user, a default workspace, and an owner membership in one transaction:

- `POST /v1/auth/register`

Registration uses normalized email addresses and scrypt password hashing. Existing emails return a conflict response with a stable error code.

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
powershell -ExecutionPolicy Bypass -File scripts/validate-operational-endpoints.ps1
powershell -ExecutionPolicy Bypass -File scripts/validate-registration.ps1
```

The operational endpoint validation expects the API and Worker runtimes to be running locally. The registration validation expects the API runtime and PostgreSQL to be available locally.

## Run built services

```bash
pnpm build
pnpm start:api:built
pnpm start:worker:built
```
