# Release Verification

This document summarizes the operational verification path for Runlane Core. It is written for repository readers who want to inspect how the backend, workers, deployment files and validation commands are kept aligned.

## Repository verification

```powershell
pnpm format
pnpm verify
```

`pnpm verify` includes formatting, lockfile registry validation, GitHub Actions validation, deployment configuration validation, documentation artifact validation, release validation, runtime script validation, linting, Prisma schema validation, TypeScript type checking and build output.

## Runtime verification

Start the datastore services, apply migrations, then run API and Worker in separate terminals:

```powershell
pnpm db:generate
pnpm docker:infra:up
pnpm db:migrate:deploy
pnpm start:api
pnpm start:worker
```

Run the curated integration validation:

```powershell
pnpm validate:integration
```

Focused runtime validations are available for related areas:

```powershell
pnpm validate:demo
pnpm validate:demo-isolation
pnpm validate:http-connector
pnpm validate:billing
pnpm validate:billing-sessions
```

## Image deployment verification

GitHub Actions verifies the repository, builds the API, Worker, migrator and Web Console images, publishes commit SHA image tags, and runs the deployment image smoke workflow.

The smoke workflow accepts a raw commit SHA and applies the `sha-` image tag prefix internally.

## Clean-room Docker verification

```powershell
pnpm validate:clean-room
```

This command rebuilds the deployment path with a dedicated Compose namespace and removes its resources at completion.

## Security verification

The release validation path covers these operational checks:

- Raw secrets are not committed.
- `.env` remains local and private.
- `.env.deploy.example` contains no external secret values.
- `PUBLIC_REGISTRATION_ENABLED` is explicit.
- `DEMO_MODE` and `DEMO_SESSION_ENABLED` are explicit.
- `HTTP_CONNECTOR_DEMO_URL_ALLOWLIST` is available for demo URL restrictions.
- `HTTP_CONNECTOR_TIMEOUT_MS`, `HTTP_CONNECTOR_REDIRECT_LIMIT` and `HTTP_CONNECTOR_MAX_RESPONSE_BYTES` are configured.
- PostgreSQL and Redis have no public deployment ports.
- CORS origins match the application and API URLs.
- JWT, refresh token, encryption and webhook signing secrets are environment-supplied.
- Stripe webhook and API credentials are environment-supplied.

## Documentation verification

The repository includes these aligned artifacts:

- README
- Architecture guide
- Security guide
- API guide
- Deployment guide
- Validation guide
- Release verification guide
- Clean-room Docker validation guide
- Postman collection
- Operational scenarios for AI routing, webhook queue processing, Stripe sync, API integration and backend infrastructure

Run:

```powershell
pnpm validate:release
```

## Operational acceptance

The release validation path covers these outcomes:

- API and Worker start independently.
- Migrations run from a clean database.
- Demo seed creates the canonical demo workspace.
- Demo login can resolve isolated session workspaces.
- Workflow execution creates queue jobs with workspace scope.
- Worker validates job scope before processing.
- HTTP connector rejects unsafe outbound destinations.
- Usage and audit records are persisted.
- Billing webhook verification and idempotency are validated.
- Deployment smoke reaches API readiness through Caddy.
