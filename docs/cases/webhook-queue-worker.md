# Reliable Webhook Queue Worker

## Problem

Webhook callers expect fast acknowledgements, but downstream processing can be slow or unreliable. A durable queue and worker boundary keeps webhook intake responsive while preserving retries and state transitions.

## Runlane flow

```txt
signed webhook
  -> signature verification
  -> replay protection
  -> idempotency reservation
  -> webhook request persistence
  -> execution creation
  -> BullMQ job
  -> Worker validation
  -> step execution
  -> retry or dead-letter
```

## Relevant modules

```txt
ingestion
execution
workflow
bullmq
redis
usage
audit
observability
```

## Demo command

```powershell
pnpm validate:webhooks
```

The validation creates a workflow, confirms unpublished webhooks are rejected, verifies signature failures, sends a signed payload, waits for the queue job and checks persisted execution state.

## API endpoints

```txt
POST /v1/workflows
POST /v1/workflows/:id/publish
POST /v1/hooks/:workflowPublicId
GET  /v1/executions/:id
POST /v1/executions/:id/retry
GET  /health/queue
```

## Operational value

This case demonstrates secure public ingestion, durable queue handoff, idempotency, replay protection, Worker-side validation, retries, dead-letter behavior and structured operational health.
