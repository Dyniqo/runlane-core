import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const files = {
  packageJson: resolve(root, 'package.json'),
  deployCompose: resolve(root, 'docker-compose.deploy.yml'),
  caddyfile: resolve(root, 'docker/Caddyfile'),
  deployEnvironment: resolve(root, '.env.deploy.example'),
  deploymentSmoke: resolve(root, '.github/workflows/deployment-smoke.yml'),
  dockerfile: resolve(root, 'Dockerfile'),
};

const failures = [];

for (const [label, path] of Object.entries(files)) {
  if (!existsSync(path)) {
    failures.push(`${label} is missing at ${path}`);
  }
}

if (failures.length === 0) {
  const packageJson = JSON.parse(readFileSync(files.packageJson, 'utf8'));
  const deployCompose = readFileSync(files.deployCompose, 'utf8');
  const caddyfile = readFileSync(files.caddyfile, 'utf8');
  const deployEnvironment = readFileSync(files.deployEnvironment, 'utf8');
  const deploymentSmoke = readFileSync(files.deploymentSmoke, 'utf8');
  const dockerfile = readFileSync(files.dockerfile, 'utf8');

  requireFragments('docker-compose.deploy.yml', deployCompose, [
    'image: ${RUNLANE_IMAGE_REGISTRY:-ghcr.io}/${RUNLANE_IMAGE_NAMESPACE:-dyniqo}/${RUNLANE_IMAGE_REPOSITORY:-runlane-core}-api:${RUNLANE_IMAGE_TAG:?RUNLANE_IMAGE_TAG is required}',
    'image: ${RUNLANE_IMAGE_REGISTRY:-ghcr.io}/${RUNLANE_IMAGE_NAMESPACE:-dyniqo}/${RUNLANE_IMAGE_REPOSITORY:-runlane-core}-worker:${RUNLANE_IMAGE_TAG:?RUNLANE_IMAGE_TAG is required}',
    'image: ${RUNLANE_IMAGE_REGISTRY:-ghcr.io}/${RUNLANE_IMAGE_NAMESPACE:-dyniqo}/${RUNLANE_IMAGE_REPOSITORY:-runlane-core}-migrator:${RUNLANE_IMAGE_TAG:?RUNLANE_IMAGE_TAG is required}',
    'image: caddy:2.11.3-alpine',
    'postgres:17.10-alpine3.23',
    'redis:8.6.4-alpine3.23',
    'condition: service_completed_successfully',
    'condition: service_healthy',
    'no-new-privileges:true',
    'cap_drop:',
    'read_only: true',
    './docker/Caddyfile:/etc/caddy/Caddyfile:ro',
    'caddy\n        - validate\n        - --config',
    'RUNLANE_PUBLIC_DOMAIN: ${RUNLANE_PUBLIC_DOMAIN:?RUNLANE_PUBLIC_DOMAIN is required}',
    'API_URL: ${API_URL:?API_URL is required}',
    'APP_URL: ${APP_URL:?APP_URL is required}',
    'JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?JWT_ACCESS_SECRET is required}',
    'WEBHOOK_SIGNING_SECRET: ${WEBHOOK_SIGNING_SECRET:?WEBHOOK_SIGNING_SECRET is required}',
  ]);

  requireFragments('docker/Caddyfile', caddyfile, [
    'admin off',
    'trusted_proxies private_ranges',
    '{$RUNLANE_PUBLIC_DOMAIN}',
    'request_body',
    'max_size {$RUNLANE_CADDY_MAX_REQUEST_BODY}',
    'reverse_proxy api:4600',
    'health_uri /health',
    'format json',
  ]);

  requireFragments('.env.deploy.example', deployEnvironment, [
    'NPM_REGISTRY=https://registry.npmjs.org/',
    'PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh',
    'HTTP_PROXY=',
    'HTTPS_PROXY=',
    'NO_PROXY=localhost,127.0.0.1,postgres,redis,migrator,api,worker,caddy',
    'RUNLANE_IMAGE_REGISTRY=ghcr.io',
    'RUNLANE_IMAGE_NAMESPACE=dyniqo',
    'RUNLANE_IMAGE_REPOSITORY=runlane-core',
    'RUNLANE_IMAGE_TAG=sha-0000000000000000000000000000000000000000',
    'RUNLANE_PUBLIC_DOMAIN=:80',
    'RUNLANE_HTTP_PORT=18080',
    'POSTGRES_PASSWORD=runlane_deploy_database_password_change_me_64_bytes_minimum_value',
    'API_URL=http://127.0.0.1:18080',
    'CORS_ORIGIN=http://127.0.0.1:18080',
    'PUBLIC_REGISTRATION_ENABLED=false',
    'DEMO_MODE=false',
  ]);

  requireFragments('.github/workflows/deployment-smoke.yml', deploymentSmoke, [
    'name: Deployment image smoke',
    'commit_sha:',
    'description: Commit SHA to smoke test. Leave empty to use the selected workflow revision.',
    'commit_sha="${commit_sha#sha-}"',
    'image_tag="sha-${commit_sha}"',
    'runs-on: ubuntu-24.04',
    'actions/checkout@v6.0.3',
    'docker/login-action@v4.2.0',
    'packages: read',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up --abort-on-container-exit --exit-code-from migrator migrator',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d api worker caddy',
    'http://127.0.0.1:18080/health/ready',
    'migrator exit code',
    'logs --no-color --tail=300 postgres redis migrator api worker caddy',
    'down -v --remove-orphans',
  ]);

  requireFragments('Dockerfile', dockerfile, [
    'FROM prisma AS migrator',
    'CMD ["pnpm", "db:migrate:deploy:runtime"]',
  ]);

  forbidFragments('Dockerfile', dockerfile, [
    'ENV npm_config_registry=',
    'CMD ["pnpm", "db:migrate:deploy"]',
  ]);

  forbidFragments(
    'deployment files',
    deployCompose + caddyfile + deployEnvironment + deploymentSmoke,
    [
      `@${'late'}${'st'}`,
      `:${'late'}${'st'}`,
      `ubuntu-${'late'}${'st'}`,
      `docker-compose.${'prod'}`,
      `${'pro'}${'duction'}`,
      'build:',
      '127.0.0.1:${RUNLANE_POSTGRES_PORT',
      '127.0.0.1:${RUNLANE_REDIS_PORT',
    ],
  );

  assertNoPublicPortsForDataStores(deployCompose);

  if (
    packageJson.scripts['db:migrate:deploy:runtime'] !==
    'pnpm db:migrate:preflight && prisma migrate deploy'
  ) {
    failures.push(
      'package.json script db:migrate:deploy:runtime must run migration preflight without runtime generation',
    );
  }

  if (packageJson.scripts['validate:deploy'] !== 'node scripts/validate-deploy-config.mjs') {
    failures.push(
      'package.json script validate:deploy must run node scripts/validate-deploy-config.mjs',
    );
  }

  if (!packageJson.scripts.verify.includes('pnpm validate:deploy')) {
    failures.push('package.json verify script must include pnpm validate:deploy');
  }
}

if (failures.length > 0) {
  console.error('Deployment configuration validation failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Deployment configuration validation completed');

function requireFragments(label, content, fragments) {
  for (const fragment of fragments) {
    if (!content.includes(fragment)) {
      failures.push(`${label} is missing fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, content, fragments) {
  for (const fragment of fragments) {
    if (content.includes(fragment)) {
      failures.push(`${label} contains forbidden fragment: ${fragment}`);
    }
  }
}

function assertNoPublicPortsForDataStores(content) {
  const serviceBlocks = readComposeServiceBlocks(content);
  for (const service of ['postgres', 'redis']) {
    const block = serviceBlocks.get(service);
    if (!block) {
      failures.push(`docker-compose.deploy.yml is missing service: ${service}`);
      continue;
    }

    if (/\n\s{4}ports:\n/.test(block)) {
      failures.push(`${service} must not expose public ports in docker-compose.deploy.yml`);
    }
  }
}

function readComposeServiceBlocks(content) {
  const blocks = new Map();
  const match = /\nservices:\n([\s\S]*)\nvolumes:\n/.exec(content);

  if (!match?.[1]) {
    failures.push('docker-compose.deploy.yml must define services before volumes');
    return blocks;
  }

  const services = match[1];
  const serviceMatches = [...services.matchAll(/^  ([a-z][a-z0-9-]*):\n/gm)];

  for (let index = 0; index < serviceMatches.length; index += 1) {
    const current = serviceMatches[index];
    const next = serviceMatches[index + 1];
    const name = current[1];
    const start = current.index ?? 0;
    const end = next?.index ?? services.length;
    blocks.set(name, services.slice(start, end));
  }

  return blocks;
}
