# Runlane Core

Runlane Core is a workflow orchestration platform built as a pnpm monorepo with independent NestJS API and Worker runtimes.

## Requirements

- Node.js 24.16.0
- pnpm 11.4.0

## Install

```bash
pnpm install --frozen-lockfile
```

## Run

```bash
pnpm start:api:dev
pnpm start:worker:dev
```

The API listens on `http://localhost:4600` and the Worker runtime listens on `http://localhost:4601`.

## Validate

```bash
pnpm verify
```

## Run built services

```bash
pnpm build
pnpm start:api:built
pnpm start:worker:built
```
