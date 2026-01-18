# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.16.0-bookworm-slim
ARG POSTGRES_IMAGE=postgres:17.10-alpine3.23

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
ENV npm_config_registry=$NPM_REGISTRY
ENV PRISMA_ENGINES_MIRROR=$PRISMA_ENGINES_MIRROR

RUN --mount=type=cache,id=runlane-npm-cache,target=/root/.npm \
  npm install --global pnpm@10.0.0 --registry=${NPM_REGISTRY}

FROM base AS dependencies

ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/infrastructure/package.json ./packages/infrastructure/package.json
COPY packages/testing/package.json ./packages/testing/package.json

RUN --mount=type=cache,id=runlane-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile --fetch-retries=10

FROM dependencies AS builder

COPY apps ./apps
COPY packages ./packages
COPY eslint.config.mjs nest-cli.json tsconfig.build.json tsconfig.json webpack.config.cjs ./

RUN pnpm build

FROM base AS runtime-dependencies

ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/infrastructure/package.json ./packages/infrastructure/package.json
COPY packages/testing/package.json ./packages/testing/package.json

RUN --mount=type=cache,id=runlane-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --prod --frozen-lockfile --fetch-retries=10

FROM ${NODE_IMAGE} AS runtime

ENV NODE_OPTIONS=--enable-source-maps

WORKDIR /app

COPY --from=runtime-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node

FROM runtime AS api

EXPOSE 4600

CMD ["node", "dist/apps/api/main.js"]

FROM runtime AS worker

EXPOSE 4601

CMD ["node", "dist/apps/worker/main.js"]

FROM ${POSTGRES_IMAGE} AS migrator

COPY --chown=postgres:postgres docker/migrations/000001-runtime-foundation.sql /migrations/000001-runtime-foundation.sql

USER postgres

CMD ["psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--file", "/migrations/000001-runtime-foundation.sql"]
