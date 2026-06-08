# SaaS Backend Infrastructure

## Problem

Workflow products need more than endpoints. They need identity, tenant isolation, access keys, durable work queues, operational health, billing state, usage limits, auditability and deployment packaging.

## Runlane flow

```txt
user registration
  -> workspace creation
  -> API key creation
  -> workflow publish
  -> webhook or automation execution
  -> usage enforcement
  -> billing synchronization
  -> audit browsing
  -> deployment health checks
```

## Relevant modules

```txt
identity
workspace
access
workflow
ingestion
automation
execution
usage
billing
audit
observability
deployment
```

## Demo command

```powershell
pnpm validate:integration
```

The curated integration validation exercises demo safety, session isolation, webhook ingestion, automation bridge isolation, usage metering and billing session contracts.

## API endpoints

```txt
POST /v1/auth/register
POST /v1/auth/login
POST /v1/api-keys
POST /v1/workflows
POST /v1/workflows/:id/publish
POST /v1/hooks/:workflowPublicId
POST /v1/automation/execute/:workflowPublicId
GET  /v1/usage/current
POST /v1/billing/checkout
GET  /health/ready
```

## Operational value

This scenario covers separate API and Worker runtimes, PostgreSQL, Redis, queue processing, billing state, tenant boundaries, validation scripts and image-based deployment configuration.
