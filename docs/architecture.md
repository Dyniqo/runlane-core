# Runlane Core Architecture

Runlane Core is a workflow automation backend with a separate API runtime, a separate Worker runtime, PostgreSQL persistence, Redis-backed queues, signed webhook ingestion, API-key protected automation execution, usage metering, audit logging, billing synchronization, and deployment-oriented container packaging.

## Runtime topology

```txt
External caller
  -> API runtime
  -> PostgreSQL transaction
  -> BullMQ execution job
  -> Worker runtime
  -> connector adapters
  -> execution, usage and audit persistence
```

The API runtime owns synchronous HTTP boundaries. It authenticates users, resolves workspace scope, validates request contracts, persists workflow and execution state, records audit events, and enqueues execution jobs.

The Worker runtime owns asynchronous execution. It validates every job against the workspace-scoped database state before processing, runs workflow steps through connector ports, persists step output, classifies failures, schedules retries, and moves exhausted executions to dead-letter state.

PostgreSQL stores durable business state. Redis stores queue state, idempotency windows, replay windows, rate-limit state, demo-session runtime limits, and worker heartbeat state.

## Architectural style

The repository uses a modular domain-oriented monolith with a queue boundary and independently deployable runtimes.

```txt
apps
  api
  worker
packages
  domain
  application
  infrastructure
  contracts
  config
prisma
scripts
docs
postman
```

The dependency direction is inward:

```txt
API and Worker composition
  -> infrastructure adapters
  -> application use cases and ports
  -> domain rules
```

Domain code does not import NestJS, Prisma, Redis, Stripe, HTTP clients, or provider SDKs. Application use cases coordinate ports and domain rules. Infrastructure implements ports using Prisma, Redis, BullMQ, cryptography, HTTP, Stripe, Slack, Discord and OpenAI-compatible providers.

## Bounded contexts

Identity handles registration, login, refresh tokens, session revocation and authenticated user responses.

Workspace handles tenant scope, current workspace resolution, membership checks, object-level authorization, demo session workspace resolution and workspace-scoped repository contracts.

Access handles API key generation, hashing, prefix display, revocation, last-used tracking and API-key guard resolution.

Workflow handles workflow definitions, trigger type, versioning, validation, publishing, public IDs and workflow test contracts.

Ingestion handles signed public webhooks, payload hashing, replay protection, idempotency windows, request persistence and execution creation.

Automation handles API-key protected workflow execution for external automation tools, caller metadata normalization and contract discovery.

Execution handles execution lifecycle, step lifecycle, queue jobs, sequential processing, branch routing, retries, dead-letter state and manual retry.

Connector handles HTTP calls, AI decisions, notification delivery, credential lookup, secret decryption, response mapping and failure classification.

Billing and usage handle plan limits, monthly usage windows, usage records, Stripe webhook idempotency, subscription state synchronization, checkout sessions and billing portal sessions.

Audit handles durable records for identity, access, workflow, ingestion, execution, billing and demo actions.

Observability handles structured logs, request IDs, correlation IDs, health checks, readiness checks, queue health and runtime lifecycle logging.

Demo handles demo seed data, reset safety, session-scoped demo workspaces, TTL, cleanup and demo runtime limits.

## Workspace isolation

`workspaceId` is the only trusted tenant boundary. Controllers do not trust a workspace identifier from request body, query string, or arbitrary headers. Workspace scope is resolved from a JWT access token, API key guard, public workflow resolution, or internal job validation.

Database rules:

```txt
workspace-owned read:  filter by workspaceId
workspace-owned write: persist workspaceId from trusted scope
workspace-owned update: filter by id and workspaceId
workspace-owned delete: filter by id and workspaceId
```

Redis rules:

```txt
ws:{workspaceId}:rate:{scope}:{key}
ws:{workspaceId}:idem:{key}
ws:{workspaceId}:replay:{key}
demo:{sessionKeyHash}
worker:{workerId}:heartbeat
```

Queue rules:

```txt
job payload includes workspaceId
job payload includes workflowId
job payload includes executionId
worker reloads execution by executionId and workspaceId
worker rejects mismatched workspace state before running steps
```

## Execution flow

1. A webhook or automation request resolves a workflow and workspace.
2. The API validates trigger type, payload shape, idempotency and plan limits.
3. The API creates an execution in a transaction.
4. The API enqueues a workspace-scoped BullMQ job.
5. The Worker validates the job against the execution and workflow records.
6. The Worker marks the execution running and runs steps sequentially.
7. Each step persists input, output, duration and error state.
8. Retryable failures schedule a retry using bounded exponential backoff.
9. Exhausted failures move the execution to dead-letter state.
10. Usage and audit records are persisted throughout the flow.

## Connector model

Connectors are infrastructure adapters behind application ports. Workflow step configuration is validated in the domain layer, while credentials and external IO stay in infrastructure.

HTTP connector safety includes protocol allowlisting, credential-free URLs, DNS validation, private IP blocking, localhost blocking, metadata endpoint blocking, redirect limits, response-size limits, hard timeouts and optional demo URL allowlisting.

AI decision steps call an OpenAI-compatible provider through a structured response adapter. Missing provider credentials fail fast when a workflow attempts to use the provider.

Notification steps deliver Slack or Discord messages through provider-specific webhook validation and safe template rendering.

## Deployment model

Local development can run API, Worker, PostgreSQL and Redis with source-based Compose. Image-based deployment uses published images for API, Worker and migrator targets, a private internal network for data stores, and Caddy as the public reverse proxy.

GitHub Actions verifies the repository, validates the lockfile registry, validates deploy configuration, builds pinned Docker targets, publishes commit-SHA tagged images, and runs an image smoke workflow against the deploy Compose stack.
