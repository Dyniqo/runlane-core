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

## Workflow secrets and connector credentials

Workflow secrets and connector credentials are encrypted before persistence and are only returned through masked API responses. Secret and credential operations are scoped by the authenticated workspace and workflow, and object access never trusts a workspace identifier from the request body.

Available endpoints:

- `GET /v1/workflows/:workflowId/secrets`
- `POST /v1/workflows/:workflowId/secrets`
- `DELETE /v1/workflows/:workflowId/secrets/:key`
- `GET /v1/workflows/:workflowId/connector-credentials`
- `POST /v1/workflows/:workflowId/connector-credentials`
- `DELETE /v1/workflows/:workflowId/connector-credentials/:name`

Secret references inside workflow step templates use `{{ secrets.key_name }}`. The execution engine validates that every referenced secret exists for the same workspace and workflow before a step runs, while persisted step input stores only safe reference markers and masked metadata.

## HTTP connector

Workflow HTTP steps execute inside the Worker through the connector boundary. The connector supports `none`, `api_key`, `bearer`, `basic`, and `custom_header` authentication modes, request URL, query, headers, JSON or text bodies, success status mapping, retryable status mapping, response body path extraction, response size limits, redirect limits, and hard timeouts.

HTTP connector requests use the workflow template resolver before execution. Workflow secret references and connector credentials are resolved only at the connector boundary and raw values are not written to execution step input, execution output, logs, or API responses.

Outbound URL safety is enforced before every request and every redirect. The connector blocks localhost, private IP ranges, link-local addresses, cloud metadata endpoints, unsafe DNS results, URL credentials, unsupported protocols, oversized responses, and redirects beyond the configured limit. `HTTP_CONNECTOR_DEMO_URL_ALLOWLIST` can restrict outbound requests to approved demo destinations.

Relevant configuration:

- `HTTP_CONNECTOR_TIMEOUT_MS`
- `HTTP_CONNECTOR_MAX_RESPONSE_BYTES`
- `HTTP_CONNECTOR_REDIRECT_LIMIT`
- `HTTP_CONNECTOR_DEMO_URL_ALLOWLIST`

Validate the connector with the API and Worker running locally:

```bash
pnpm validate:http-connector
```

## AI provider

The AI provider boundary exposes an OpenAI-compatible structured response adapter for Worker-side workflow steps. The adapter sends chat completion requests to `AI_BASE_URL`, uses `AI_MODEL` by default, enforces a hard timeout through `AI_TIMEOUT_MS`, validates provider responses as JSON, and rejects structured outputs that do not match the requested schema.

The provider API key is supplied through `AI_API_KEY`. Runtime startup does not require the key, but the adapter fails fast with a configuration error when a workflow tries to call the provider without credentials.

Relevant configuration:

- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
- `AI_TIMEOUT_MS`

Validate the local structured response contract without credentials:

```bash
pnpm validate:ai-provider
```

When `AI_API_KEY` is configured, the same command performs a live OpenAI-compatible structured response request.

## AI decision workflow step

Workflow steps with type `ai_decision` run inside the Worker through the AI provider port. The step builds templated provider messages from the execution payload and previous step output, requests a structured JSON object from the configured OpenAI-compatible provider, validates that object against the step schema, persists safe decision output, and exposes a `branch` value for workflow transitions.

AI decision steps support `messages`, `schema`, optional `model`, optional `temperature`, optional `maxOutputTokens`, and optional `branchPath`. The default branch path is `branch`. When a step transition defines `branches`, the execution engine routes to the matching target step after the AI decision succeeds.

Validate AI decision execution with the API and Worker running locally:

```bash
pnpm validate:ai-decision
```

When `AI_API_KEY` is not configured, the validation confirms the Worker fail-fast path without retrying. When `AI_API_KEY` is configured, the same command validates a real AI decision execution and branch transition.

## Notification connectors

Workflow steps with type `notification` deliver Slack or Discord messages from the Worker through the notification connector boundary. The connector supports templated messages, optional titles, severity, metadata, execution context fields, workflow-scoped `webhook_url` connector credentials, and environment-supplied default webhooks.

Failure alerts can be delivered to configured Slack and Discord webhooks when an execution reaches `failed` or `dead_letter`. Failure alert delivery is best-effort and never changes the terminal execution status.

Relevant configuration:

- `SLACK_WEBHOOK_URL`
- `DISCORD_WEBHOOK_URL`
- `NOTIFICATION_CONNECTOR_TIMEOUT_MS`
- `NOTIFICATION_CONNECTOR_MAX_PAYLOAD_BYTES`
- `NOTIFICATION_FAILURE_ALERTS_ENABLED`

Validate notification execution with the API and Worker running locally:

```bash
pnpm validate:notifications
```

When `SLACK_WEBHOOK_URL` is not configured, the validation confirms the Worker fail-fast path without retrying. When `SLACK_WEBHOOK_URL` is configured, the same command validates real Slack notification delivery.

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
pnpm validate:http-connector
pnpm validate:ai-decision
pnpm validate:notifications
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
