import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];

const requiredFiles = [
  'apps/web/package.json',
  'apps/web/index.html',
  'apps/web/vite.config.ts',
  'apps/web/tsconfig.json',
  'apps/web/src/main.tsx',
  'apps/web/src/app/App.tsx',
  'apps/web/src/api/client.ts',
  'apps/web/src/styles/app.scss',
  'apps/web/public/favicon.svg',
  'apps/web/public/favicon.ico',
  'apps/web/public/apple-touch-icon.png',
  'apps/web/public/manifest.webmanifest',
  'apps/web/public/icons/icon-192.png',
  'apps/web/public/icons/icon-512.png',
  'apps/web/public/brand/mark.svg',
];

const rootPackageScripts = {
  'build:web': 'pnpm --filter @runlane/web-console build',
  'dev:web': 'pnpm --filter @runlane/web-console dev',
  'preview:web': 'pnpm --filter @runlane/web-console preview',
  'typecheck:web': 'pnpm --filter @runlane/web-console typecheck',
  'validate:web': 'node scripts/validate-web-console.mjs',
};

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    errors.push(`Missing web console file: ${file}`);
  }
}

const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(rootPackageScripts)) {
  if (rootPackage.scripts?.[name] !== command) {
    errors.push(`package.json script ${name} is missing or invalid`);
  }
}

if (!rootPackage.scripts?.verify?.includes('pnpm validate:web')) {
  errors.push('package.json verify script must include pnpm validate:web');
}

if (rootPackage.scripts?.clean !== 'rimraf dist coverage .run apps/web/dist') {
  errors.push('package.json clean script must remove apps/web/dist');
}

const webPackage = JSON.parse(readFileSync(join(root, 'apps/web/package.json'), 'utf8'));
const webScripts = webPackage.scripts ?? {};

if (webPackage.name !== '@runlane/web-console') {
  errors.push('apps/web/package.json must keep the @runlane/web-console workspace name');
}

if (webScripts.build !== 'tsc -p tsconfig.json --noEmit && vite build') {
  errors.push('apps/web build script must typecheck before vite build');
}

if (webScripts.dev !== 'vite --host 127.0.0.1 --port 4610') {
  errors.push('apps/web dev script must bind to 127.0.0.1:4610');
}

if (webScripts.preview !== 'vite preview --host 127.0.0.1 --port 4610') {
  errors.push('apps/web preview script must bind to 127.0.0.1:4610');
}

if (webScripts.typecheck !== 'tsc -p tsconfig.json --noEmit') {
  errors.push('apps/web typecheck script is missing or invalid');
}

const viteConfig = readFileSync(join(root, 'apps/web/vite.config.ts'), 'utf8');
for (const fragment of ['port: 4610', 'strictPort: true', "host: '127.0.0.1'"]) {
  if (!viteConfig.includes(fragment)) {
    errors.push(`apps/web/vite.config.ts is missing fragment: ${fragment}`);
  }
}

const indexHtml = readFileSync(join(root, 'apps/web/index.html'), 'utf8');
for (const fragment of [
  '<meta name="theme-color" content="#f7f8fb" />',
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
  '<link rel="icon" sizes="any" href="/favicon.ico" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<script type="module" src="/src/main.tsx"></script>',
]) {
  if (!indexHtml.includes(fragment)) {
    errors.push(`apps/web/index.html is missing fragment: ${fragment}`);
  }
}

const apiClient = readFileSync(join(root, 'apps/web/src/api/client.ts'), 'utf8');
for (const fragment of ['VITE_RUNLANE_API_URL', "'http://127.0.0.1:4600'"]) {
  if (!apiClient.includes(fragment)) {
    errors.push(`apps/web API client is missing fragment: ${fragment}`);
  }
}

const appSource = readFileSync(join(root, 'apps/web/src/app/App.tsx'), 'utf8');
for (const route of ['overview', 'builder', 'runs', 'integrations', 'usage', 'plans', 'audit']) {
  if (!appSource.includes(`/${route}`)) {
    errors.push(`apps/web route is missing: /${route}`);
  }
}

const manifest = JSON.parse(
  readFileSync(join(root, 'apps/web/public/manifest.webmanifest'), 'utf8'),
);
if (manifest.name !== 'Runlane Console' || manifest.short_name !== 'Runlane') {
  errors.push('manifest web app name is not aligned with the console');
}

const iconSet = new Set(
  (manifest.icons ?? []).map((icon) => `${icon.src}|${icon.sizes}|${icon.type}`),
);
for (const icon of [
  '/icons/icon-192.png|192x192|image/png',
  '/icons/icon-512.png|512x512|image/png',
]) {
  if (!iconSet.has(icon)) {
    errors.push(`manifest is missing icon: ${icon}`);
  }
}

for (const file of requiredFiles.filter(
  (file) =>
    file.endsWith('.ts') ||
    file.endsWith('.tsx') ||
    file.endsWith('.scss') ||
    file.endsWith('.html') ||
    file.endsWith('.json') ||
    file.endsWith('.webmanifest') ||
    file.endsWith('.svg'),
)) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const fragment of forbiddenFragments()) {
    if (text.includes(fragment)) {
      errors.push(`Forbidden presentation fragment in ${file}: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Web console validation failed');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Web console validation completed');

function forbiddenFragments() {
  return [
    'TODO',
    'placeholder',
    ['Up', 'work'].join(''),
    ['up', 'work'].join(''),
    ['AI', 'assisted'].join('-'),
    ['deployment', 'ready'].join('-'),
    [['pro', 'duction'].join(''), 'ready'].join('-'),
    ['UI', ['ph', 'ase'].join('')].join(' '),
    ['SaaS', 'panel'].join(' '),
    ['coming', 'soon'].join(' '),
    ['not', 'deployed'].join(' '),
  ];
}
