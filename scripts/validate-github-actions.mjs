import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const ciWorkflowPath = resolve(root, '.github/workflows/ci.yml');
const smokeWorkflowPath = resolve(root, '.github/workflows/deployment-smoke.yml');
const packagePath = resolve(root, 'package.json');
const dockerfilePath = resolve(root, 'Dockerfile');
const webCaddyfilePath = resolve(root, 'docker/web.Caddyfile');
const npmrcPath = resolve(root, '.npmrc');
const lockfilePath = resolve(root, 'pnpm-lock.yaml');

const workflow = readFileSync(ciWorkflowPath, 'utf8');
const smokeWorkflow = existsSync(smokeWorkflowPath) ? readFileSync(smokeWorkflowPath, 'utf8') : '';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const dockerfile = readFileSync(dockerfilePath, 'utf8');
const webCaddyfile = existsSync(webCaddyfilePath) ? readFileSync(webCaddyfilePath, 'utf8') : '';
const npmrc = existsSync(npmrcPath) ? readFileSync(npmrcPath, 'utf8') : '';
const lockfile = existsSync(lockfilePath) ? readFileSync(lockfilePath, 'utf8') : '';
const failures = [];

const requiredWorkflowFragments = [
  'actions/checkout@v6.0.3',
  'pnpm/action-setup@v6.0.8',
  'actions/setup-node@v6.4.0',
  'docker/setup-buildx-action@v4.1.0',
  'docker/login-action@v4.2.0',
  'docker/build-push-action@v7.0.0',
  'name: Build and publish container images',
  'packages: write',
  'ghcr.io',
  'sha-${{ github.sha }}',
  'cache-from: type=gha,scope=runlane-${{ matrix.target }}',
  'cache-to: type=gha,mode=max,scope=runlane-${{ matrix.target }}',
  'target: api',
  'target: worker',
  'target: migrator',
  'target: web',
  'postgres:17.10-alpine3.23',
  'redis:8.6.4-alpine3.23',
  'NPM_REGISTRY: https://registry.npmjs.org/',
  'Configure package registry',
  'pnpm config set registry "$NPM_REGISTRY"',
  'npm config set registry "$NPM_REGISTRY"',
  'test "$(pnpm config get registry)" = "$NPM_REGISTRY"',
  'test "$(npm config get registry)" = "$NPM_REGISTRY"',
  'test "$(pnpm config get fetch-retries)" = "5"',
  'test "$(pnpm config get network-timeout)" = "300000"',
  'Validate lockfile registry',
  'node scripts/normalize-pnpm-lockfile-registry.mjs --check',
  'pnpm fetch --frozen-lockfile',
  'pnpm install --frozen-lockfile --prefer-offline',
  'Validate runtime scripts',
  'pnpm validate:runtime-scripts',
];

for (const fragment of requiredWorkflowFragments) {
  if (!workflow.includes(fragment)) {
    failures.push(`Missing workflow fragment: ${fragment}`);
  }
}

const requiredNpmrcFragments = [
  'registry=https://registry.npmjs.org/',
  'fetch-retries=5',
  'fetch-retry-factor=2',
  'fetch-retry-mintimeout=10000',
  'fetch-retry-maxtimeout=120000',
  'network-timeout=300000',
  'network-concurrency=8',
];

for (const fragment of requiredNpmrcFragments) {
  if (!npmrc.includes(fragment)) {
    failures.push(`Missing .npmrc fragment: ${fragment}`);
  }
}

const forbiddenRegistryFragments = [
  'packages.applied-caas-gateway1.internal.api.openai.org',
  'artifactory/api/npm/npm-public',
];

for (const fragment of forbiddenRegistryFragments) {
  if (
    workflow.includes(fragment) ||
    smokeWorkflow.includes(fragment) ||
    npmrc.includes(fragment) ||
    lockfile.includes(fragment)
  ) {
    failures.push(`Forbidden registry fragment: ${fragment}`);
  }
}

const forbiddenWorkflowFragments = [
  '@latest',
  ':latest',
  'node-version: 24\n',
  'ubuntu-latest',
  'name: Build and publish ${{ matrix.service }} image',
  'NPM_CONFIG_REGISTRY:',
  'npm_config_',
  'NPM_FETCH_RETRIES:',
  'NPM_FETCH_RETRY_FACTOR:',
  'NPM_FETCH_RETRY_MINTIMEOUT:',
  'NPM_FETCH_RETRY_MAXTIMEOUT:',
  'NPM_NETWORK_TIMEOUT:',
  'NPM_NETWORK_CONCURRENCY:',
];

for (const fragment of forbiddenWorkflowFragments) {
  if (workflow.includes(fragment) || smokeWorkflow.includes(fragment)) {
    failures.push(`Forbidden workflow fragment: ${fragment}`);
  }
}

for (const line of workflow.split('\n')) {
  const trimmedLine = line.trim();

  if (trimmedLine.startsWith('name:') && trimmedLine.includes('${{ matrix.')) {
    failures.push(`Workflow name fields must not contain matrix expressions: ${trimmedLine}`);
  }
}

for (const block of readEnvBlocks(workflow)) {
  const normalizedEnvKeys = new Map();

  for (const key of block.keys) {
    const normalizedKey = key.toLowerCase();
    const existingKey = normalizedEnvKeys.get(normalizedKey);

    if (existingKey) {
      failures.push(`Workflow env key is duplicated case-insensitively: ${existingKey} and ${key}`);
    }

    normalizedEnvKeys.set(normalizedKey, key);
  }
}

if (!workflow.includes('NPM_REGISTRY: https://registry.npmjs.org/')) {
  failures.push('Workflow must define NPM_REGISTRY at top level');
}

if (lockfile.includes('tarball:') && !lockfile.includes('https://registry.npmjs.org/')) {
  failures.push(
    'pnpm-lock.yaml tarball URLs must use the public npm registry when tarball URLs are present',
  );
}

const dockerTargets = ['api', 'worker', 'migrator', 'web'];

for (const target of dockerTargets) {
  const pattern = new RegExp(`^FROM\\s+.+\\s+AS\\s+${target}$`, 'm');

  if (!pattern.test(dockerfile)) {
    failures.push(`Dockerfile target is missing: ${target}`);
  }
}

if (packageJson.scripts['prisma:studio'] !== 'prisma studio') {
  failures.push('package.json script prisma:studio must run prisma studio');
}

if (
  packageJson.scripts['lockfile:registry'] !==
  'node scripts/normalize-pnpm-lockfile-registry.mjs --write'
) {
  failures.push('package.json script lockfile:registry is missing or invalid');
}

if (
  packageJson.scripts['lockfile:registry:check'] !==
  'node scripts/normalize-pnpm-lockfile-registry.mjs --check'
) {
  failures.push('package.json script lockfile:registry:check is missing or invalid');
}

if (packageJson.scripts['validate:ci'] !== 'node scripts/validate-github-actions.mjs') {
  failures.push('package.json script validate:ci is missing or invalid');
}

if (
  packageJson.scripts['docker:logs'] !==
  'docker compose logs --follow postgres redis migrator api worker web'
) {
  failures.push('package.json script docker:logs must include the web service');
}

if (!dockerfile.includes('COPY docker/web.Caddyfile /etc/caddy/Caddyfile')) {
  failures.push('Dockerfile web target must copy docker/web.Caddyfile');
}

if (
  !dockerfile.includes(
    'CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]',
  )
) {
  failures.push('Dockerfile web target must run Caddy with its checked-in config');
}

if (!webCaddyfile.includes('try_files {path} /index.html')) {
  failures.push('docker/web.Caddyfile must keep SPA route fallback');
}

if (!packageJson.scripts.verify.includes('pnpm lockfile:registry:check')) {
  failures.push('package.json verify script must include pnpm lockfile:registry:check');
}

if (!packageJson.scripts.verify.includes('pnpm validate:ci')) {
  failures.push('package.json verify script must include pnpm validate:ci');
}

if (smokeWorkflow) {
  const requiredSmokeFragments = [
    'docker/login-action@v4.2.0',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet',
    'docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d',
    'curl --fail --silent --header "Host: api.runlane.localhost" http://127.0.0.1:18080/health',
    'curl --fail --silent --header "Host: runlane.localhost" http://127.0.0.1:18080/',
  ];

  for (const fragment of requiredSmokeFragments) {
    if (!smokeWorkflow.includes(fragment)) {
      failures.push(`Missing deployment smoke workflow fragment: ${fragment}`);
    }
  }
}

if (failures.length > 0) {
  console.error('GitHub Actions validation failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('GitHub Actions validation completed');

function readEnvBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^(?<indent>\s*)env:\s*$/.exec(line);

    if (!match?.groups) {
      continue;
    }

    const baseIndent = match.groups.indent.length;
    const keys = [];

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];

      if (!candidate.trim()) {
        continue;
      }

      const indent = candidate.length - candidate.trimStart().length;

      if (indent <= baseIndent) {
        break;
      }

      const keyMatch = /^\s+([A-Za-z0-9_]+):/.exec(candidate);

      if (keyMatch?.[1]) {
        keys.push(keyMatch[1]);
      }
    }

    blocks.push({ keys });
  }

  return blocks;
}
