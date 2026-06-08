# Demo Assets Checklist

This checklist keeps repository media aligned with the backend capabilities shown in the README and case studies.

## Required captures

- GitHub Actions verification and container image publishing success
- Deployment image smoke success
- Swagger or OpenAPI route list from the API runtime
- Postman collection overview with Identity, Workflows, Webhooks, Automation Bridge, Executions, Usage, Billing, Audit, Demo and Health folders
- Demo seed command output
- Demo session isolation validation output
- HTTP connector safety validation output
- Workflow execution list showing queued, running, succeeded, failed, retrying or dead-letter states where applicable
- Execution detail showing step outputs and duration fields
- Worker health and queue health responses
- Stripe webhook validation output
- Release validation output from `pnpm verify`

## Terminal captures

Use concise terminal captures with the command and success line visible:

```txt
pnpm verify
pnpm validate:integration
pnpm validate:demo-isolation
pnpm validate:http-connector
pnpm validate:clean-room
```

## API captures

Recommended API captures:

```txt
GET https://api.runlane.dyniqo.dev/health
GET https://api.runlane.dyniqo.dev/health/ready
GET https://api.runlane.dyniqo.dev/v1
GET https://api.runlane.dyniqo.dev/docs
```

## Repository captures

Recommended repository captures:

- README hero and validation sections
- Architecture overview
- HTTP connector security section
- Case study index
- Deployment guide
- Release notes

## Naming

Use short, stable file names for assets:

```txt
actions-ci-success.png
deployment-smoke-success.png
swagger-overview.png
postman-collection.png
demo-isolation-validation.png
http-connector-safety.png
execution-detail.png
worker-health.png
release-validation.png
```
