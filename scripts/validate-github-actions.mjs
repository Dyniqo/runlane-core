import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const workflowPath = resolve(root, '.github/workflows/ci.yml');
const packagePath = resolve(root, 'package.json');
const dockerfilePath = resolve(root, 'Dockerfile');

const workflow = readFileSync(workflowPath, 'utf8');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const dockerfile = readFileSync(dockerfilePath, 'utf8');
const failures = [];

const requiredFragments = [
  'actions/checkout@v6.0.3',
  'pnpm/action-setup@v6.0.8',
  'actions/setup-node@v6.4.0',
  'docker/setup-buildx-action@v4.1.0',
  'docker/login-action@v4.2.0',
  'docker/build-push-action@v7.0.0',
  'packages: write',
  'ghcr.io',
  'sha-${{ github.sha }}',
  'cache-from: type=gha,scope=runlane-${{ matrix.target }}',
  'cache-to: type=gha,mode=max,scope=runlane-${{ matrix.target }}',
  'target: api',
  'target: worker',
  'target: migrator',
  'postgres:17.10-alpine3.23',
  'redis:8.6.4-alpine3.23',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    failures.push(`Missing workflow fragment: ${fragment}`);
  }
}

const forbiddenFragments = ['@latest', ':latest', 'node-version: 24\n', 'ubuntu-latest'];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    failures.push(`Forbidden workflow fragment: ${fragment}`);
  }
}

const dockerTargets = ['api', 'worker', 'migrator'];

for (const target of dockerTargets) {
  const pattern = new RegExp(`^FROM\\s+.+\\s+AS\\s+${target}$`, 'm');

  if (!pattern.test(dockerfile)) {
    failures.push(`Dockerfile target is missing: ${target}`);
  }
}

if (packageJson.scripts['prisma:studio'] !== 'prisma studio') {
  failures.push('package.json script prisma:studio must run prisma studio');
}

if (packageJson.scripts['validate:ci'] !== 'node scripts/validate-github-actions.mjs') {
  failures.push('package.json script validate:ci is missing or invalid');
}

if (!packageJson.scripts.verify.includes('pnpm validate:ci')) {
  failures.push('package.json verify script must include pnpm validate:ci');
}

if (failures.length > 0) {
  console.error('GitHub Actions validation failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('GitHub Actions validation completed');
