# Runlane Core Validation

Validation is part of normal delivery. The project keeps fast configuration checks inside `pnpm verify` and keeps API-level validations as explicit commands that run against a started API and Worker.

## Commit validation

Run before committing:

```powershell
pnpm format
pnpm verify
```

`pnpm verify` checks formatting, lockfile registry safety, GitHub Actions configuration, deployment configuration, documentation artifacts, release validation, runtime script compatibility, linting, Prisma schema validity, TypeScript type checking and build output.

## Local API validation

Start the API and Worker first:

```powershell
pnpm db:migrate:deploy
pnpm start:api
pnpm start:worker
```

Run focused validations:

```powershell
pnpm validate:demo
pnpm validate:demo-isolation
pnpm validate:webhooks
pnpm validate:automation
pnpm validate:http-connector
pnpm validate:usage
pnpm validate:billing
pnpm validate:billing-sessions
```

Run the curated integration validation:

```powershell
pnpm validate:integration
```

## Demo commands

Seed demo data:

```powershell
pnpm demo:seed
```

Reset current demo workspace:

```powershell
pnpm demo:reset
```

Send a signed lead-routing webhook:

```powershell
pnpm demo:lead-routing
```

Execute the seeded automation bridge workflow:

```powershell
pnpm demo:automation-bridge
```

Create and execute a dedicated HTTP API integration workflow:

```powershell
pnpm demo:api-integration
```

## Release validation

Run release validation checks:

```powershell
pnpm validate:release
```

Run the clean-room Docker validation when Docker or deployment files change:

```powershell
pnpm validate:clean-room
```

The clean-room command is separate from `pnpm verify` because it rebuilds the Docker path and starts a dedicated Compose namespace.

## Configuration validation

CI configuration validation prevents accidental use of internal registries, floating action tags, unsafe workflow names and unpinned image references.

Deployment configuration validation prevents public datastore ports, floating image tags, missing Caddy security configuration and incomplete deployment environment examples.

Documentation artifact validation verifies that required docs, demo scripts and Postman folders are present and aligned with package scripts.

Release validation verifies that the README, release verification guide, clean-room validation guide, operational scenario index and release commands remain aligned.
