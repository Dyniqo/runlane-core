# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.16.0-bookworm-slim

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
ENV PRISMA_HIDE_UPDATE_MESSAGE=true

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
ENV npm_config_registry=$NPM_REGISTRY
ENV PRISMA_ENGINES_MIRROR=$PRISMA_ENGINES_MIRROR

RUN --mount=type=cache,id=runlane-apt-cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,id=runlane-apt-lib,target=/var/lib/apt,sharing=locked \
  rm -f /etc/apt/apt.conf.d/docker-clean \
  && apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

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

FROM dependencies AS prisma

ARG DATABASE_URL=postgresql://runlane:runlane_build@127.0.0.1:5432/runlane?schema=public

ENV DATABASE_URL=$DATABASE_URL

COPY prisma ./prisma
COPY scripts/database-migration-preflight.mjs ./scripts/database-migration-preflight.mjs
COPY scripts/prisma-client-loader.mjs ./scripts/prisma-client-loader.mjs

RUN --mount=type=cache,id=runlane-prisma-cache,target=/root/.cache/prisma \
  pnpm db:generate \
  && pnpm exec prisma version

FROM prisma AS builder

COPY apps ./apps
COPY packages ./packages
COPY eslint.config.mjs nest-cli.json tsconfig.build.json tsconfig.json webpack.config.cjs ./

RUN pnpm build

FROM prisma AS runtime-dependencies

ENV CI=true

RUN --mount=type=cache,id=runlane-pnpm-store,target=/pnpm/store \
  generated_client="$(find /app/node_modules/.pnpm -type d -path '*/node_modules/.prisma/client' -print -quit)" \
  && test -n "${generated_client}" \
  && cp -a "${generated_client}" /tmp/prisma-client \
  && rm -rf /app/node_modules /app/apps/*/node_modules /app/packages/*/node_modules \
  && pnpm config set store-dir /pnpm/store \
  && pnpm install --prod --frozen-lockfile --fetch-retries=10 \
  && client_package="$(node -p "require.resolve('@prisma/client/package.json')")" \
  && client_node_modules="$(dirname "$(dirname "$(dirname "${client_package}")")")" \
  && rm -rf "${client_node_modules}/.prisma/client" \
  && mkdir -p "${client_node_modules}/.prisma" \
  && cp -a /tmp/prisma-client "${client_node_modules}/.prisma/client" \
  && rm -rf /tmp/prisma-client \
  && node -e 'const { PrismaClient } = require("@prisma/client"); const client = new PrismaClient(); client.$disconnect();'

FROM ${NODE_IMAGE} AS runtime

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV NODE_OPTIONS=--enable-source-maps

WORKDIR /app

RUN --mount=type=cache,id=runlane-runtime-apt-cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,id=runlane-runtime-apt-lib,target=/var/lib/apt,sharing=locked \
  rm -f /etc/apt/apt.conf.d/docker-clean \
  && apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

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

FROM prisma AS migrator

ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache

USER node

CMD ["pnpm", "db:migrate:deploy"]
