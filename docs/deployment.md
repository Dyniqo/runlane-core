# Runlane Core Deployment

Runlane Core includes two container paths: source-based local Compose and image-based deployment Compose.

## Service domains

The deployment configuration uses these public service domains:

```txt
https://runlane.dyniqo.dev
https://api.runlane.dyniqo.dev
```

The application origin is `https://runlane.dyniqo.dev`. The API origin is `https://api.runlane.dyniqo.dev`.

## Local validation path

Use the local path while developing or validating a commit:

```powershell
pnpm db:generate
pnpm format
pnpm verify
pnpm db:migrate:deploy
pnpm start:api
pnpm start:worker
```

The API listens on `http://localhost:4600`. The Worker listens on `http://localhost:4601` for operational health endpoints.

## Image publishing path

GitHub Actions verifies the repository, validates deployment configuration, builds Docker targets and publishes images to GitHub Container Registry using commit-SHA tags.

Published image names follow this shape:

```txt
ghcr.io/<namespace>/runlane-core-api:sha-<commit-sha>
ghcr.io/<namespace>/runlane-core-worker:sha-<commit-sha>
ghcr.io/<namespace>/runlane-core-migrator:sha-<commit-sha>
```

## Deployment files

The deployment host needs these files:

```txt
docker-compose.deploy.yml
.env.deploy
```

Create `.env.deploy` from `.env.deploy.example` and replace secrets, domain values, image namespace and image tag values.

Required deployment secrets:

```txt
POSTGRES_PASSWORD
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
ENCRYPTION_KEY
WEBHOOK_SIGNING_SECRET
STRIPE_WEBHOOK_SECRET
STRIPE_API_KEY
```

Provider secrets such as `AI_API_KEY`, `SLACK_WEBHOOK_URL` and `DISCORD_WEBHOOK_URL` are required only for flows that use those providers.

## Start deployment stack

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

Check status:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml ps
```

Inspect logs:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml logs -f migrator api worker caddy
```

## Caddy entry point

Caddy is the public entry point. It validates its configuration before starting, enforces request body limits, applies security headers, compresses responses and reverse proxies to the API service on the internal Docker network.

PostgreSQL and Redis remain internal services and do not expose public ports in the deployment Compose file.

## Smoke workflow

The deployment smoke workflow pulls published images, validates Compose configuration, starts the deployment stack, checks health endpoints and tears the stack down with volumes removed. It uses the image tag supplied through workflow input or the current commit SHA tag.

## Operational endpoints

```txt
https://api.runlane.dyniqo.dev/health
https://api.runlane.dyniqo.dev/health/ready
https://api.runlane.dyniqo.dev/health/queue
https://api.runlane.dyniqo.dev/docs
```

## Deployment environment reference

Important deployment values:

```txt
RUNLANE_PUBLIC_DOMAIN=api.runlane.dyniqo.dev
RUNLANE_HTTP_PORT=80
RUNLANE_HTTPS_PORT=443
API_URL=https://api.runlane.dyniqo.dev
APP_URL=https://runlane.dyniqo.dev
CORS_ORIGIN=https://runlane.dyniqo.dev,https://api.runlane.dyniqo.dev
```
