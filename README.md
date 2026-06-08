# Runlane Core

Runlane Core is a NestJS backend for workflow automation, webhook processing, API integrations, AI decision steps, Stripe billing synchronization, usage metering and queue-based execution.

It is built as a pnpm monorepo with independent API and Worker runtimes, shared domain/application/infrastructure packages, PostgreSQL persistence, Redis/BullMQ queues, Docker-based operations, image-based deployment and automated validation artifacts.

## Core capabilities

Runlane Core includes a complete backend vertical slice:

- Workspace-scoped authentication and API keys
- Workflow definitions with versioning and publish lifecycle
- Webhook ingestion with signature, timestamp, replay and idempotency controls
- API-key protected automation bridge execution
- Queue-backed execution processing through a separate Worker runtime
- Sequential workflow steps, retries, dead-letter state and manual retry
- HTTP connector execution with secret injection and SSRF protection
- OpenAI-compatible AI decision steps with structured JSON validation
- Slack and Discord notification connectors
- Usage tracking and plan enforcement
- Stripe checkout, portal and webhook subscription synchronization
- Audit logs, structured runtime logs, request IDs and readiness endpoints
- Session-scoped demo workspaces with isolated mutable state
- Local and image-based deployment flows with CI and smoke validation

## Service endpoints

The deployment configuration uses these service endpoints:

- Application: `https://runlane.dyniqo.dev`
- API: `https://api.runlane.dyniqo.dev`
- API documentation path: `https://api.runlane.dyniqo.dev/docs`
- Health path: `https://api.runlane.dyniqo.dev/health`

## Architecture overview

The repository uses a modular DDD monolith with a separate Worker runtime and queue boundary.

```txt
apps/api          HTTP API, controllers, guards, OpenAPI and runtime wiring
apps/worker       BullMQ processing, workflow execution and connector execution
packages/domain   Entities, value objects and business rules
packages/application  Use cases, ports and orchestration boundaries
packages/infrastructure  Prisma, Redis, BullMQ, Stripe, AI, HTTP, crypto and logger adapters
packages/contracts  DTOs, jobs, events, workflow schemas and shared runtime contracts
packages/config   Typed environment validation and configuration modules
packages/testing  Shared validation fixtures and helpers
```

Dependency direction is inward:

- Domain code does not depend on NestJS, Prisma, Redis, Stripe or external SDKs.
- Application use cases depend on domain rules and explicit ports.
- Infrastructure implements ports and owns integration details.
- API and Worker apps compose modules and expose runtime boundaries.

## Request and execution flow

A typical workflow request moves through these boundaries:

1. A caller sends a signed webhook or API-key protected automation request.
2. The API resolves the workflow and workspace without trusting a client-supplied workspace id.
3. Replay, idempotency, payload size and signature rules are enforced.
4. An execution and initial audit/usage records are created transactionally.
5. A workspace-scoped BullMQ job is enqueued.
6. The Worker reloads the execution by `executionId` and `workspaceId` before processing.
7. The execution engine runs each step, records step output and classifies failures.
8. Retryable failures use the configured backoff policy.
9. Terminal states persist usage, audit records and safe output snapshots.

## Tenant isolation

`workspaceId` is the only valid access boundary for workspace-owned data.

Runlane does not trust `workspaceId` from request bodies, query strings or arbitrary headers. The active workspace is resolved from JWT scope, API key scope or internal workflow resolution. Workspace-owned repository operations require `workspaceId` and filter reads, writes, updates and deletes by that scope.

Redis keys for workspace-owned runtime state use explicit namespace builders. BullMQ execution jobs carry `workspaceId`, `workflowId` and `executionId`, and the Worker verifies those values before execution.

## HTTP connector security

The Worker-side HTTP connector is built for controlled outbound HTTP workflow steps. It enforces:

- Blocking localhost, private IP ranges, link-local ranges and cloud metadata endpoints
- DNS resolution validation before outbound requests
- Redirect validation on every hop
- Redirect count limits through `HTTP_CONNECTOR_REDIRECT_LIMIT`
- Response size limits through `HTTP_CONNECTOR_MAX_RESPONSE_BYTES`
- Hard request timeouts through `HTTP_CONNECTOR_TIMEOUT_MS`
- Demo URL restrictions through `HTTP_CONNECTOR_DEMO_URL_ALLOWLIST`
- Blocking URL credentials and unsupported protocols
- Secret masking in logs, execution input and API responses

Validate the connector with the API and Worker running:

```powershell
pnpm validate:http-connector
```

## Demo workspaces

Runlane supports a shared demo account without shared mutable data. When demo mode and demo sessions are enabled, `POST /v1/auth/login` accepts a `demoSessionId`, resolves it to an isolated workspace, and issues a JWT scoped to that workspace.

Every request after login uses the standard workspace guard. Other modules do not branch on demo behavior. Resetting one session workspace does not change another session workspace.

Useful commands:

```powershell
pnpm validate:demo
pnpm validate:demo-isolation
pnpm demo:seed
pnpm demo:reset
pnpm demo:lead-routing
pnpm demo:automation-bridge
pnpm demo:api-integration
```

## Operational scenarios

The repository includes operational scenario documentation for the main flows:

- [AI Lead Routing](docs/cases/ai-lead-routing.md)
- [Reliable Webhook Queue Worker](docs/cases/webhook-queue-worker.md)
- [Stripe Webhook Subscription Sync](docs/cases/stripe-webhook-sync.md)
- [API Integration Backend](docs/cases/api-integration-backend.md)
- [SaaS Backend Infrastructure](docs/cases/saas-backend-infrastructure.md)

Use [Operational Scenario Index](docs/cases/index.md) as the entry point for the complete scenario map.

## Requirements

- Node.js 24.16.0
- pnpm 10.0.0
- Docker Engine with Docker Compose

## Install

```powershell
pnpm install --frozen-lockfile --fetch-retries=10
```

## Configuration

Use `.env.example` as the local configuration reference and `.env.deploy.example` as the image-based deployment reference.

The API and Worker load `.env.local` first and `.env` second without overriding variables already provided by the operating system. PostgreSQL and Redis must be available before API or Worker readiness succeeds.

Important environment groups:

- Runtime: `RUNTIME_PROFILE`, `API_HOST`, `API_PORT`, `WORKER_HOST`, `WORKER_PORT`
- Datastores: `DATABASE_URL`, `REDIS_URL`
- Auth: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`
- Security: `ENCRYPTION_KEY`, `WEBHOOK_SIGNING_SECRET`, `CORS_ORIGIN`, `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`, `MAX_PAYLOAD_SIZE`
- HTTP connector: `HTTP_CONNECTOR_TIMEOUT_MS`, `HTTP_CONNECTOR_MAX_RESPONSE_BYTES`, `HTTP_CONNECTOR_REDIRECT_LIMIT`, `HTTP_CONNECTOR_DEMO_URL_ALLOWLIST`
- AI: `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`
- Billing: `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER_ID`, `STRIPE_PRICE_PRO_ID`, `STRIPE_PRICE_AGENCY_ID`
- Demo: `DEMO_MODE`, `DEMO_SESSION_ENABLED`, `DEMO_SESSION_TTL_HOURS`, `DEMO_MAX_SESSIONS_PER_IP_PER_HOUR`, `DEMO_CLEANUP_INTERVAL_HOURS`

## Database

Start infrastructure services and apply migrations:

```powershell
pnpm docker:infra:up
pnpm db:generate
pnpm db:migrate:deploy
```

Create a migration after changing `prisma/schema.prisma`:

```powershell
pnpm db:migrate:create -- --name migration_name
```

Validate schema and migration state:

```powershell
pnpm db:validate
pnpm db:migrate:status
```

## Run locally

```powershell
pnpm db:generate
pnpm docker:infra:up
pnpm db:migrate:deploy
pnpm start:api
pnpm start:worker
```

The API listens on `http://localhost:4600`. The Worker listens on `http://localhost:4601` for operational endpoints.

## API and operational endpoints

The API uses URI versioning. The current descriptor is available at `GET /v1`. OpenAPI documentation is available at `/docs` and the OpenAPI JSON document is available at `/docs/openapi.json` when `API_DOCS_ENABLED=true`.

Operational endpoints:

- `GET /health`
- `GET /health/ready`
- `GET /health/queue`

## Core API surface

Identity:

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`

Workspace and access:

- `GET /v1/workspaces`
- `GET /v1/workspaces/current`
- `PATCH /v1/workspaces/current`
- `GET /v1/api-keys`
- `POST /v1/api-keys`
- `DELETE /v1/api-keys/:id`

Workflows and executions:

- `GET /v1/workflows`
- `POST /v1/workflows`
- `GET /v1/workflows/:id`
- `PATCH /v1/workflows/:id`
- `POST /v1/workflows/:id/publish`
- `POST /v1/workflows/:id/test`
- `GET /v1/executions`
- `GET /v1/executions/:id`
- `GET /v1/executions/:id/steps`
- `POST /v1/executions/:id/retry`

Ingestion and automation:

- `POST /v1/hooks/:workflowPublicId`
- `POST /v1/automation/execute/:workflowPublicId`
- `GET /v1/automation/contracts/:workflowPublicId`

Usage, billing, audit and demo:

- `GET /v1/usage/current`
- `POST /v1/billing/checkout`
- `POST /v1/billing/portal`
- `POST /v1/billing/webhook`
- `GET /v1/audit-logs`
- `POST /v1/demo/seed`
- `POST /v1/demo/reset`

## Docker operations

```powershell
pnpm docker:config
pnpm docker:infra:up
pnpm docker:migrate
pnpm docker:up:detached
pnpm docker:logs
pnpm docker:down
pnpm docker:reset
```

Local Docker binds API to `http://127.0.0.1:14600`, PostgreSQL to loopback port `15432`, and Redis to loopback port `16379`.

## Image-based deployment

Commit SHA tagged images are published to GHCR for API, Worker and migrator targets. The deployment Compose file runs PostgreSQL, Redis, migrator, API, Worker and Caddy.

Deployment files:

- `docker-compose.deploy.yml`
- `docker/Caddyfile`
- `.env.deploy.example`
- `.github/workflows/deployment-smoke.yml`
- [Deployment Guide](docs/deployment.md)
- [Clean-room Docker Validation](docs/clean-room-docker-validation.md)

## Validation

Fast local validation:

```powershell
pnpm format
pnpm verify
```

`pnpm verify` checks formatting, lockfile registry safety, GitHub Actions configuration, deployment configuration, documentation artifacts, release validation, runtime script compatibility, linting, Prisma schema validity, TypeScript type checking and build output.

API-level validation requires API and Worker runtimes to be running:

```powershell
pnpm validate:integration
pnpm validate:demo
pnpm validate:demo-isolation
pnpm validate:webhooks
pnpm validate:automation
pnpm validate:http-connector
pnpm validate:usage
pnpm validate:billing
pnpm validate:billing-sessions
```

Release validation:

```powershell
pnpm validate:release
pnpm validate:clean-room
```

The clean-room validation script uses Docker and rebuilds the deployment path from a clean Compose namespace. It is separate from `pnpm verify` because it starts containers and consumes more time than the fast local checks.

## Documentation map

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [API](docs/api.md)
- [Deployment](docs/deployment.md)
- [Validation](docs/validation.md)
- [Release Verification](docs/release-checklist.md)
- [Clean-room Docker Validation](docs/clean-room-docker-validation.md)
- [Operational Scenario Index](docs/cases/index.md)

## Operational verification

Runlane Core has a complete release verification path:

- `pnpm verify` for formatting, static validation, type checking and build output.
- `pnpm validate:integration` for the curated API and Worker flow.
- `pnpm validate:clean-room` for a full Docker deployment validation when the container path changes.
- CI verification for repository validation and image publishing.
- Deployment image smoke for published commit SHA images.
- Secret values remain environment-supplied and are not committed.
- `.env.deploy.example` documents the required deployment environment shape.

## Contact Us

We'd love to hear from you! If you have questions, suggestions, or need support, here are the ways to reach us:

**Website:** [dyniqo.dev](https://dyniqo.dev)  
**Email:** [contact@dyniqo.dev](mailto:contact@dyniqo.dev)  
**GitHub Issues:** [Open an Issue](https://github.com/dyniqo/runlane-core/issues)

We look forward to hearing from you!
