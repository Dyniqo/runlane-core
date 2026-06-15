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
  webCaddyfile: resolve(root, 'docker/web.Caddyfile'),
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
  const webCaddyfile = readFileSync(files.webCaddyfile, 'utf8');

  requireFragments('docker-compose.deploy.yml', deployCompose, [
    'image: ${RUNLANE_IMAGE_REGISTRY:-ghcr.io}/${RUNLANE_IMAGE_NAMESPACE:-dyniqo}/${RUNLANE_IMAGE_REPOSITORY:-runlane-core}-api:${RUNLANE_IMAGE_TAG:?RUNLANE_IMAGE_TAG is required}',
    'image: ${RUNLANE_IMAGE_REGISTRY:-ghcr.io}/${RUNLANE_IMAGE_NAMESPACE:-dyniqo}/${RUNLANE_IMAGE_REPOSITORY:-runlane-core}-worker:${RUNLANE_IMAGE_TAG:?RUNLANE_IMAGE_TAG is required}',
    'image: ${RUNLANE_IMAGE_REGISTRY:-ghcr.io}/${RUNLANE_IMAGE_NAMESPACE:-dyniqo}/${RUNLANE_IMAGE_REPOSITORY:-runlane-core}-migrator:${RUNLANE_IMAGE_TAG:?RUNLANE_IMAGE_TAG is required}',
    'image: ${RUNLANE_IMAGE_REGISTRY:-ghcr.io}/${RUNLANE_IMAGE_NAMESPACE:-dyniqo}/${RUNLANE_IMAGE_REPOSITORY:-runlane-core}-web:${RUNLANE_IMAGE_TAG:?RUNLANE_IMAGE_TAG is required}',
    'image: caddy:2.11.3-alpine',
    'postgres:17.10-alpine3.23',
    'redis:8.6.4-alpine3.23',
    'condition: service_completed_successfully',
    'condition: service_healthy',
    'no-new-privileges:true',
    'cap_drop:',
    'read_only: true',
    './docker/Caddyfile:/etc/caddy/Caddyfile:ro',
    'command:\n      - caddy\n      - run\n      - --config\n      - /etc/caddy/Caddyfile\n      - --adapter\n      - caddyfile',
    'caddy\n        - validate\n        - --config',
    'RUNLANE_WEB_DOMAIN: ${RUNLANE_WEB_DOMAIN:?RUNLANE_WEB_DOMAIN is required}',
    'RUNLANE_API_DOMAIN: ${RUNLANE_API_DOMAIN:?RUNLANE_API_DOMAIN is required}',
    '- /config:size=16m,mode=0755',
    '- /data:size=16m,mode=0755',
    'API_URL: ${API_URL:?API_URL is required}',
    'APP_URL: ${APP_URL:?APP_URL is required}',
    'JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?JWT_ACCESS_SECRET is required}',
    'WEBHOOK_SIGNING_SECRET: ${WEBHOOK_SIGNING_SECRET:?WEBHOOK_SIGNING_SECRET is required}',
  ]);

  requireFragments('Dockerfile', dockerfile, [
    'FROM caddy:2.11.3-alpine AS web',
    'COPY docker/web.Caddyfile /etc/caddy/Caddyfile',
    'COPY --from=builder /app/apps/web/dist /usr/share/caddy',
    'EXPOSE 3000',
    'CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]',
  ]);

  requireFragments('docker/web.Caddyfile', webCaddyfile, [
    'admin off',
    ':3000',
    'root * /usr/share/caddy',
    'try_files {path} /index.html',
    'file_server',
    'X-Content-Type-Options nosniff',
  ]);

  requireFragments('docker/Caddyfile', caddyfile, [
    'admin off',
    '{$RUNLANE_WEB_DOMAIN}',
    '{$RUNLANE_API_DOMAIN}',
    'request_body',
    'max_size {$RUNLANE_CADDY_MAX_REQUEST_BODY}',
    'reverse_proxy web:3000',
    'reverse_proxy api:4600',
    'health_uri /health',
    'format json',
  ]);

  forbidFragments('docker/Caddyfile', caddyfile, ['trusted_proxies', 'private_ranges']);

  requireFragments('.env.deploy.example', deployEnvironment, [
    'NPM_REGISTRY=https://registry.npmjs.org/',
    'PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh',
    'HTTP_PROXY=',
    'HTTPS_PROXY=',
    'NO_PROXY=localhost,127.0.0.1,postgres,redis,migrator,api,worker,web,caddy',
    'RUNLANE_IMAGE_REGISTRY=ghcr.io',
    'RUNLANE_IMAGE_NAMESPACE=dyniqo',
    'RUNLANE_IMAGE_REPOSITORY=runlane-core',
    'RUNLANE_IMAGE_TAG=sha-0000000000000000000000000000000000000000',
    'RUNLANE_WEB_DOMAIN=runlane.dyniqo.dev',
    'RUNLANE_API_DOMAIN=api.runlane.dyniqo.dev',
    'RUNLANE_HTTP_PORT=80',
    'RUNLANE_HTTPS_PORT=443',
    'POSTGRES_PASSWORD=runlane_deploy_database_password_change_me_64_bytes_minimum_value',
    'API_URL=https://api.runlane.dyniqo.dev',
    'APP_URL=https://runlane.dyniqo.dev',
    'STRIPE_CHECKOUT_SUCCESS_URL=https://runlane.dyniqo.dev/billing/success',
    'STRIPE_CHECKOUT_CANCEL_URL=https://runlane.dyniqo.dev/billing/cancel',
    'STRIPE_PORTAL_RETURN_URL=https://runlane.dyniqo.dev/billing',
    'CORS_ORIGIN=https://runlane.dyniqo.dev,https://api.runlane.dyniqo.dev',
    'PUBLIC_REGISTRATION_ENABLED=false',
    'DEMO_MODE=false',
  ]);

  requireFragments('.github/workflows/deployment-smoke.yml', deploymentSmoke, [
    'name: Deployment image smoke',
    'runs-on: ubuntu-24.04',
    'actions/checkout@v6.0.3',
    'docker/login-action@v4.2.0',
    'packages: read',
    'image_tag="${image_tag#sha-}"',
    'RUNLANE_IMAGE_TAG=sha-${image_tag}',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up --abort-on-container-exit --exit-code-from migrator migrator',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d api worker web caddy',
    'http://127.0.0.1:18080/health/ready',
    'Caddy status:',
    'logs --no-color --tail=200 caddy',
    'migrator exit code',
    'Waiting for deployment service health checks',
    'Deployment service health checks are ready.',
    'Deployment service health checks did not become ready.',
    'curl --fail --silent --header "Host: api.runlane.localhost" http://127.0.0.1:18080/health > /dev/null',
    'curl --fail --silent --header "Host: runlane.localhost" http://127.0.0.1:18080/ > /dev/null',
    'down -v --remove-orphans',
  ]);

  forbidFragments(
    'deployment files',
    deployCompose + caddyfile + deployEnvironment + deploymentSmoke,
    [
      `@${'late'}${'st'}`,
      `:${'late'}${'st'}`,
      `ubuntu-${'late'}${'st'}`,
      `docker-compose.${'prod'}`,
      'docker-compose.release',
      'build:',
      '127.0.0.1:${RUNLANE_POSTGRES_PORT',
      '127.0.0.1:${RUNLANE_REDIS_PORT',
      'run --rm --no-deps caddy validate',
      '["caddy", "file-server"',
    ],
  );

  assertNoPublicPortsForDataStores(deployCompose);

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
