# Runlane Core

Runlane Core is a workflow orchestration platform built as a pnpm monorepo with independent NestJS API and Worker runtimes.

## Requirements

- Node.js 24.16.0
- pnpm 10.0.0
- Docker Engine with Docker Compose

## Install

```bash
pnpm install --frozen-lockfile --fetch-retries=10
```

## Configuration

The API and Worker load `.env.local` first and `.env` second without overriding variables already provided by the operating system. Local defaults keep both runtimes executable without an environment file.

Use `.env.example` as the complete local configuration reference. Use `.env.deploy.example` as the deployment configuration reference. The local `.env` file remains excluded from version control. The deploy runtime profile requires explicit public URLs and datastore connection URLs and stops during startup when they are missing or invalid.

## Run locally

```bash
pnpm start:api:dev
pnpm start:worker:dev
```

The local API listens on `http://localhost:4600` and the local Worker runtime listens on `http://localhost:4601`.

## Run with Docker

```bash
pnpm docker:up
```

The Docker API listens on `http://127.0.0.1:14600`. PostgreSQL and Redis are bound to loopback on ports `15432` and `16379`. The Worker runtime is available only inside the Docker network.

Docker host ports can be changed with `RUNLANE_API_PORT`, `RUNLANE_POSTGRES_PORT`, and `RUNLANE_REDIS_PORT` without changing container ports. Public runtime URLs can be changed with `RUNLANE_PUBLIC_API_URL` and `RUNLANE_PUBLIC_APP_URL`. The Compose project namespace can be changed with `RUNLANE_COMPOSE_PROJECT_NAME`.

## Docker operations

```bash
pnpm docker:config
pnpm docker:up:detached
pnpm docker:logs
pnpm docker:down
pnpm docker:reset
```

## Validate

```bash
pnpm verify
pnpm docker:config
```

## Run built services

```bash
pnpm build
pnpm start:api:built
pnpm start:worker:built
```
