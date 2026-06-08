import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];
const requiredFiles = [
  'docs/architecture.md',
  'docs/security.md',
  'docs/api.md',
  'docs/deployment.md',
  'docs/validation.md',
  'docs/release-checklist.md',
  'docs/clean-room-docker-validation.md',
  'docs/cases/index.md',
  'docs/cases/ai-lead-routing.md',
  'docs/cases/webhook-queue-worker.md',
  'docs/cases/stripe-webhook-sync.md',
  'docs/cases/api-integration-backend.md',
  'docs/cases/saas-backend-infrastructure.md',
  'README.md',
  'postman/Runlane-Core.postman_collection.json',
  'scripts/demo-seed-workspace.ps1',
  'scripts/demo-reset-workspace.ps1',
  'scripts/demo-send-lead.ps1',
  'scripts/demo-automation-bridge.ps1',
  'scripts/demo-api-integration.ps1',
  'scripts/validate-integration-flow.ps1',
  'scripts/validate-release-readiness.mjs',
  'scripts/validate-clean-room-docker.ps1',
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) {
    failures.push(`Required artifact is missing: ${file}`);
  }
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const requiredScripts = {
  'demo:seed': 'powershell -ExecutionPolicy Bypass -File scripts/demo-seed-workspace.ps1',
  'demo:reset': 'powershell -ExecutionPolicy Bypass -File scripts/demo-reset-workspace.ps1',
  'demo:lead-routing': 'powershell -ExecutionPolicy Bypass -File scripts/demo-send-lead.ps1',
  'demo:automation-bridge':
    'powershell -ExecutionPolicy Bypass -File scripts/demo-automation-bridge.ps1',
  'demo:api-integration':
    'powershell -ExecutionPolicy Bypass -File scripts/demo-api-integration.ps1',
  'validate:integration':
    'powershell -ExecutionPolicy Bypass -File scripts/validate-integration-flow.ps1',
  'validate:docs': 'node scripts/validate-documentation-artifacts.mjs',
  'validate:release': 'node scripts/validate-release-readiness.mjs',
  'validate:clean-room':
    'powershell -ExecutionPolicy Bypass -File scripts/validate-clean-room-docker.ps1',
};

for (const [name, command] of Object.entries(requiredScripts)) {
  if (packageJson.scripts[name] !== command) {
    failures.push(`package.json script ${name} is missing or invalid`);
  }
}

if (!packageJson.scripts.verify.includes('pnpm validate:docs')) {
  failures.push('package.json verify script must include pnpm validate:docs');
}

if (!packageJson.scripts.verify.includes('pnpm validate:release')) {
  failures.push('package.json verify script must include pnpm validate:release');
}

const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
for (const fragment of [
  '## Contact Us',
  '**Website:** [dyniqo.dev](https://dyniqo.dev)',
  '**Email:** [contact@dyniqo.dev](mailto:contact@dyniqo.dev)',
  '**GitHub Issues:** [Open an Issue](https://github.com/dyniqo/runlane-core/issues)',
  '## Release status',
  'docs/release-checklist.md',
  'docs/clean-room-docker-validation.md',
]) {
  if (!readme.includes(fragment)) {
    failures.push(`README.md is missing contact or release fragment: ${fragment}`);
  }
}

const docs = requiredFiles
  .filter((file) => file.startsWith('docs/'))
  .map((file) => [file, readFileSync(resolve(root, file), 'utf8')]);

for (const [file, content] of docs) {
  if (!/^#\s+/.test(content)) {
    failures.push(`${file} must start with a level-one heading`);
  }

  for (const fragment of ['TODO', 'placeholder', 'student', 'Upwork', 'AI-assisted']) {
    if (content.includes(fragment)) {
      failures.push(`${file} contains forbidden documentation fragment: ${fragment}`);
    }
  }
}

const postman = JSON.parse(
  readFileSync(resolve(root, 'postman/Runlane-Core.postman_collection.json'), 'utf8'),
);
const postmanFolders = new Set((postman.item ?? []).map((item) => item.name));
const requiredPostmanFolders = [
  'Identity',
  'Workspaces',
  'Access',
  'Workflows',
  'Public Webhooks',
  'Automation Bridge',
  'Executions',
  'Usage',
  'Billing',
  'Audit',
  'Demo',
  'Health',
];

for (const folder of requiredPostmanFolders) {
  if (!postmanFolders.has(folder)) {
    failures.push(`Postman collection is missing folder: ${folder}`);
  }
}

if (!postman.info?.schema?.includes('collection/v2.1.0')) {
  failures.push('Postman collection must use schema v2.1.0');
}

const collectionText = JSON.stringify(postman);
for (const endpoint of [
  '/v1/auth/register',
  '/v1/auth/login',
  '/v1/workflows',
  '/v1/hooks/',
  '/v1/automation/execute/',
  '/v1/billing/webhook',
  '/v1/demo/seed',
  '/health/ready',
]) {
  if (!collectionText.includes(endpoint)) {
    failures.push(`Postman collection is missing endpoint fragment: ${endpoint}`);
  }
}

if (failures.length > 0) {
  console.error('Documentation artifact validation failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Documentation artifact validation completed');
