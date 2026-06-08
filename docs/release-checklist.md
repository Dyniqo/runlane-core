# Release Checklist

This checklist defines the final release gate for Runlane Core. It keeps release work operational, repeatable and safe without adding a separate stabilization phase.

## Local repository gate

Run these commands before creating the release commit:

```powershell
pnpm format
pnpm verify
```

The verification command must include formatting, lockfile registry validation, GitHub Actions validation, deployment configuration validation, documentation artifact validation, release readiness validation, runtime script validation, linting, Prisma schema validation, TypeScript type checking and build output.

## Runtime gate

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

Run focused validations when the related area changed:

```powershell
pnpm validate:demo
pnpm validate:demo-isolation
pnpm validate:http-connector
pnpm validate:billing
pnpm validate:billing-sessions
```

## Deployment image gate

After pushing the release commit, GitHub Actions must complete successfully:

- Verification and container image publishing
- Deployment image smoke

The smoke workflow should use the release commit SHA. The workflow accepts the raw SHA and applies the `sha-` image tag prefix internally.

## Clean-room Docker gate

Run the clean-room validation when the deployment path, Dockerfile, deployment Compose, Caddy configuration or migration behavior changes:

```powershell
pnpm validate:clean-room
```

This command rebuilds the deployment path with a dedicated Compose namespace and cleans up its resources when it finishes.

## Security gate

Confirm these items before deployment:

- No raw secrets are committed.
- `.env` remains local and private.
- `.env.deploy.example` contains no real external credentials.
- `PUBLIC_REGISTRATION_ENABLED` is intentionally configured.
- `DEMO_MODE` and `DEMO_SESSION_ENABLED` are intentionally configured.
- `HTTP_CONNECTOR_DEMO_URL_ALLOWLIST` is configured for public demo environments.
- `HTTP_CONNECTOR_TIMEOUT_MS`, `HTTP_CONNECTOR_REDIRECT_LIMIT` and `HTTP_CONNECTOR_MAX_RESPONSE_BYTES` are set.
- PostgreSQL and Redis are not exposed publicly.
- CORS origins match the deployed API and application URLs.
- JWT, refresh token, encryption and webhook signing secrets are replaced with private values.
- Stripe webhook and API credentials are replaced with private values before enabling billing flows.

## Documentation gate

Confirm these artifacts are present and aligned:

- README
- Architecture guide
- Security guide
- API guide
- Deployment guide
- Validation guide
- Release checklist
- Clean-room Docker validation guide
- Postman collection
- Case studies for AI routing, webhook queue processing, Stripe sync, API integration and backend infrastructure

Run:

```powershell
pnpm validate:release
```

## Operational acceptance

A release is acceptable when these outcomes are true:

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
