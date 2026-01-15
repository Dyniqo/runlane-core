# Runlane Core

Runlane Core is a workflow orchestration platform built as a pnpm monorepo with independent NestJS API and Worker runtimes.

## Requirements

- Node.js 24.16.0
- pnpm 11.4.0
- Docker Engine with Docker Compose

## Install

```bash
pnpm install --frozen-lockfile
```

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

Docker host ports can be changed with `RUNLANE_API_PORT`, `RUNLANE_POSTGRES_PORT`, and `RUNLANE_REDIS_PORT` without changing container ports. The Compose project namespace can be changed with `RUNLANE_COMPOSE_PROJECT_NAME`.

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
