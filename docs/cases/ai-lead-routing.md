# AI Lead Routing Automation

## Problem

Inbound leads often arrive through forms, CRM webhooks or automation tools without a consistent qualification path. Manual review slows response time and makes routing inconsistent.

## Runlane flow

```txt
lead payload
  -> signed webhook
  -> execution record
  -> BullMQ job
  -> Worker
  -> AI decision step
  -> notification or nurture branch
  -> usage and audit records
```

## Relevant modules

```txt
identity
workspace
workflow
ingestion
execution
connector
usage
audit
notification
```

## Demo command

```powershell
pnpm demo:lead-routing
```

The command seeds demo data, selects the webhook workflow, signs a lead payload, sends it to `POST /v1/hooks/:workflowPublicId`, and prints the accepted execution.

## API endpoints

```txt
POST /v1/demo/seed
POST /v1/hooks/:workflowPublicId
GET  /v1/executions/:id
GET  /v1/executions/:id/steps
GET  /v1/usage/current
GET  /v1/audit-logs
```

## Operational value

This case demonstrates secure webhook intake, asynchronous execution, provider-based decision making, branch routing, notification delivery, usage metering and auditability in one flow.
