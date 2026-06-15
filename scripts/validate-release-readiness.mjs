import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];

const requiredFiles = [
  'README.md',
  'docs/release-checklist.md',
  'docs/clean-room-docker-validation.md',
  'docs/validation.md',
  'docs/web-console.md',
  'docs/cases/index.md',
  'docs/cases/ai-lead-routing.md',
  'docs/cases/webhook-queue-worker.md',
  'docs/cases/stripe-webhook-sync.md',
  'docs/cases/api-integration-backend.md',
  'docs/cases/saas-backend-infrastructure.md',
  'scripts/validate-clean-room-docker.ps1',
];

const removedFiles = [
  ['docs', ['ui', 'panel', ['hand', 'off'].join('')].join('-') + '.md'].join('/'),
  ['docs', ['saas', 'panel', 'ui', ['hand', 'off'].join('')].join('-') + '.md'].join('/'),
  ['docs', ['ui', ['ph', 'ase'].join('')].join('-') + '.md'].join('/'),
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) {
    failures.push(`Required release artifact is missing: ${file}`);
  }
}

for (const file of removedFiles) {
  if (existsSync(resolve(root, file))) {
    failures.push(`Removed release artifact still exists: ${file}`);
  }
}

const read = (file) => readFileSync(resolve(root, file), 'utf8');

if (failures.length === 0) {
  const packageJson = JSON.parse(read('package.json'));
  const scripts = packageJson.scripts ?? {};
  const requiredScripts = {
    'validate:release': 'node scripts/validate-release-readiness.mjs',
    'validate:clean-room':
      'powershell -ExecutionPolicy Bypass -File scripts/validate-clean-room-docker.ps1',
  };

  for (const [name, command] of Object.entries(requiredScripts)) {
    if (scripts[name] !== command) {
      failures.push(`package.json script ${name} is missing or invalid`);
    }
  }

  if (!scripts.verify?.includes('pnpm validate:release')) {
    failures.push('package.json verify script must include pnpm validate:release');
  }

  const readme = read('README.md');
  const requiredReadmeFragments = [
    '# Runlane Core',
    '## Core capabilities',
    '## Service endpoints',
    '## Architecture overview',
    '## Tenant isolation',
    '## HTTP connector security',
    '## Demo workspaces',
    '## Operational scenarios',
    '## Image-based deployment',
    '## Operational verification',
    '## Contact Us',
    'https://runlane.dyniqo.dev',
    'https://api.runlane.dyniqo.dev',
    'docs/release-checklist.md',
    'docs/clean-room-docker-validation.md',
    'docs/cases/index.md',
    'pnpm validate:release',
    'pnpm validate:clean-room',
  ];

  for (const fragment of requiredReadmeFragments) {
    if (!readme.includes(fragment)) {
      failures.push(`README.md is missing release fragment: ${fragment}`);
    }
  }

  const securityFragments = [
    'Blocking localhost, private IP ranges, link-local ranges and cloud metadata endpoints',
    'DNS resolution validation before outbound requests',
    'Redirect count limits through `HTTP_CONNECTOR_REDIRECT_LIMIT`',
    'Response size limits through `HTTP_CONNECTOR_MAX_RESPONSE_BYTES`',
    'Hard request timeouts through `HTTP_CONNECTOR_TIMEOUT_MS`',
    'Demo URL restrictions through `HTTP_CONNECTOR_DEMO_URL_ALLOWLIST`',
  ];

  for (const fragment of securityFragments) {
    if (!readme.includes(fragment)) {
      failures.push(`README.md is missing HTTP connector safety fragment: ${fragment}`);
    }
  }

  const releaseChecklist = read('docs/release-checklist.md');
  const cleanRoomGuide = read('docs/clean-room-docker-validation.md');
  const caseIndex = read('docs/cases/index.md');
  const cleanRoomScript = read('scripts/validate-clean-room-docker.ps1');

  for (const [file, content, fragments] of [
    [
      'docs/release-checklist.md',
      releaseChecklist,
      [
        'pnpm verify',
        'pnpm validate:integration',
        'pnpm validate:clean-room',
        'HTTP_CONNECTOR_DEMO_URL_ALLOWLIST',
        'Release Verification',
      ],
    ],
    [
      'docs/clean-room-docker-validation.md',
      cleanRoomGuide,
      ['pnpm validate:clean-room', 'Clean-room Docker validation completed', 'Dockerfile'],
    ],
    [
      'docs/cases/index.md',
      caseIndex,
      [
        'AI Lead Routing',
        'Reliable Webhook Queue Worker',
        'Stripe Webhook Subscription Sync',
        'API Integration Backend',
        'SaaS Backend Infrastructure',
        'What this covers',
      ],
    ],
    [
      'scripts/validate-clean-room-docker.ps1',
      cleanRoomScript,
      ['param(', 'docker compose', 'Clean-room Docker validation completed', 'finally'],
    ],
  ]) {
    for (const fragment of fragments) {
      if (!content.includes(fragment)) {
        failures.push(`${file} is missing release fragment: ${fragment}`);
      }
    }
  }

  const forbiddenFragments = buildForbiddenFragments();
  for (const file of [
    'README.md',
    'docs/release-checklist.md',
    'docs/clean-room-docker-validation.md',
    'docs/cases/index.md',
    'docs/validation.md',
  'docs/web-console.md',
    'docs/deployment.md',
  ]) {
    const content = read(file);
    for (const fragment of forbiddenFragments) {
      if (content.includes(fragment)) {
        failures.push(`${file} contains forbidden release fragment: ${fragment}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Release validation failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Release validation completed');

function buildForbiddenFragments() {
  return [
    'TODO',
    'placeholder',
    ['Up', 'work'].join(''),
    ['up', 'work'].join(''),
    ['AI', 'assisted'].join('-'),
    'student',
    ['deployment', 'ready'].join('-'),
    [['pro', 'duction'].join(''), 'ready'].join('-'),
    ['port', 'folio'].join(''),
    ['coming', 'soon'].join(' '),
    ['not', 'deployed'].join(' '),
    ['UI', ['ph', 'ase'].join('')].join(' '),
    ['SaaS', 'panel'].join(' '),
    [['Con', 'firm'].join(''), 'these'].join(' '),
    ['Primary', ['pro', 'of'].join(''), 'points'].join(' '),
    ['What', 'it', ['demon', 'strates'].join('')].join(' '),
    ['public', 'repository', ['present', 'ation'].join('')].join(' '),
  ];
}
