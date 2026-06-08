# API Integration Backend

## Problem

External API calls need credential isolation, safe outbound networking, timeouts, retry classification and structured output capture. Direct calls from request handlers make failures harder to isolate.

## Runlane flow

```txt
automation request
  -> API key guard
  -> execution creation
  -> Worker job
  -> template resolver
  -> HTTP connector
  -> response mapping
  -> usage record
  -> audit record
```

## Relevant modules

```txt
access
automation
workflow
execution
connector
secrets
usage
audit
```

## Demo command

```powershell
pnpm demo:api-integration
```

The command creates a workflow with an HTTP step, publishes it, executes it through the automation bridge and waits for queue transfer.

## API endpoints

```txt
POST /v1/api-keys
POST /v1/workflows
POST /v1/workflows/:id/publish
POST /v1/automation/execute/:workflowPublicId
GET  /v1/executions/:id/steps
```

## Operational value

This scenario covers safe API integration with secret boundaries, request mapping, response-size controls, retryable status classification and Worker-side execution.
