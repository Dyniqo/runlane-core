# Runlane Core API

Runlane Core exposes a versioned REST API under `/v1` and operational endpoints outside the version prefix.

## Authentication

```txt
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/auth/me
```

Registration creates a user, default workspace and owner membership in one transaction. Login returns access and refresh tokens plus the current workspace. Demo login can accept `demoSessionId` to resolve an isolated demo workspace before tokens are issued.

## Workspaces

```txt
GET   /v1/workspaces
GET   /v1/workspaces/current
PATCH /v1/workspaces/current
```

Workspace reads are scoped from the authenticated token. Session-scoped demo users only see their current demo workspace in list responses.

## API keys

```txt
GET    /v1/api-keys
GET    /v1/api-keys/current
POST   /v1/api-keys
DELETE /v1/api-keys/:id
```

API keys authenticate automation bridge callers. Created keys are shown once. Later responses expose only prefix and metadata.

## Workflows

```txt
GET   /v1/workflows
POST  /v1/workflows
GET   /v1/workflows/:id
PATCH /v1/workflows/:id
POST  /v1/workflows/:id/publish
POST  /v1/workflows/:id/test
```

Workflow definitions contain a trigger, an entry step and a list of step definitions. Publishing validates the workflow definition and freezes a callable version.

## Public webhooks

```txt
POST /v1/hooks/:workflowPublicId
```

Public webhook requests require `X-Runlane-Signature`. Optional source and idempotency metadata can be provided with `X-Runlane-Source` and `X-Runlane-Idempotency-Key`.

## Automation bridge

```txt
GET  /v1/automation/contracts/:workflowPublicId
POST /v1/automation/execute/:workflowPublicId
```

Automation bridge endpoints require `X-Runlane-Api-Key`. They allow external automation tools to discover the callable contract and enqueue executions without user JWT tokens.

## Executions

```txt
GET  /v1/executions
GET  /v1/executions/:id
GET  /v1/executions/:id/steps
POST /v1/executions/:id/retry
```

Execution responses expose workflow scope, lifecycle state, input snapshots, output snapshots, errors, attempts and duration. Manual retry is allowed only for workspace-owned retryable terminal states.

## Secrets and connector credentials

```txt
GET    /v1/workflows/:workflowId/secrets
POST   /v1/workflows/:workflowId/secrets
DELETE /v1/workflows/:workflowId/secrets/:key
GET    /v1/workflows/:workflowId/connector-credentials
POST   /v1/workflows/:workflowId/connector-credentials
DELETE /v1/workflows/:workflowId/connector-credentials/:name
```

Secret and credential values are encrypted before persistence and returned only as masked metadata.

## Usage

```txt
GET /v1/usage/current
```

Usage responses include the active plan, limits, current monthly window and metered quantities.

## Billing

```txt
POST /v1/billing/checkout
POST /v1/billing/portal
POST /v1/billing/webhook
```

Checkout and portal endpoints require JWT authentication. The webhook endpoint requires Stripe signature verification.

## Audit

```txt
GET /v1/audit-logs
```

Audit logs are workspace-scoped and pageable. They record identity, access, workflow, ingestion, execution, usage, billing and demo events.

## Demo

```txt
POST /v1/demo/seed
POST /v1/demo/reset
```

Seed creates the canonical demo state. Reset restores the current demo workspace to seed state and refuses non-demo workspaces.

## Health

```txt
GET /health
GET /health/ready
GET /health/queue
GET /metrics
```

Readiness verifies required dependencies. Queue health verifies Redis transport used by the execution queue.
