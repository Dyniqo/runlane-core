import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const scriptDirectory = join(root, 'scripts');
const packageJsonPath = join(root, 'package.json');
const dockerfilePath = join(root, 'Dockerfile');
const errors = [];
const forbiddenFragments = [
  `import { PrismaClient } from ${quote('@prisma/client')}`,
  `import { PrismaClient } from ${doubleQuote('@prisma/client')}`,
];

const scriptFiles = listFiles(scriptDirectory).filter(
  (path) => path.endsWith('.mjs') || path.endsWith('.ps1'),
);

for (const filePath of scriptFiles) {
  const content = readFileSync(filePath, 'utf8');
  const displayPath = toDisplayPath(filePath);

  for (const fragment of forbiddenFragments) {
    if (content.includes(fragment)) {
      errors.push(`${displayPath} must load PrismaClient through scripts/prisma-client-loader.mjs`);
    }
  }
}

for (const requiredFile of [
  'scripts/prisma-client-loader.mjs',
  'scripts/database-migration-preflight.mjs',
]) {
  const fullPath = join(root, requiredFile);

  try {
    statSync(fullPath);
  } catch {
    errors.push(`${requiredFile} is required`);
  }
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const dockerfile = readFileSync(dockerfilePath, 'utf8');
const preflightContent = readFileSync(
  join(root, 'scripts/database-migration-preflight.mjs'),
  'utf8',
);

if (!preflightContent.includes("import { PrismaClient } from './prisma-client-loader.mjs';")) {
  errors.push('database-migration-preflight.mjs must use the shared Prisma client loader');
}

if (
  packageJson.scripts['db:migrate:deploy'] !==
  'pnpm db:generate && pnpm db:migrate:preflight && prisma migrate deploy'
) {
  errors.push('db:migrate:deploy must generate Prisma Client before migration preflight');
}

if (
  packageJson.scripts['validate:runtime-scripts'] !== 'node scripts/validate-runtime-scripts.mjs'
) {
  errors.push('package.json script validate:runtime-scripts is missing or invalid');
}

if (!packageJson.scripts.verify.includes('pnpm validate:runtime-scripts')) {
  errors.push('package.json verify script must include pnpm validate:runtime-scripts');
}

if (
  !dockerfile.includes(
    'COPY scripts/database-migration-preflight.mjs ./scripts/database-migration-preflight.mjs',
  )
) {
  errors.push('Dockerfile must copy database-migration-preflight.mjs into the Prisma stage');
}

if (
  !dockerfile.includes('COPY scripts/prisma-client-loader.mjs ./scripts/prisma-client-loader.mjs')
) {
  errors.push('Dockerfile must copy prisma-client-loader.mjs into the Prisma stage');
}

if (!/FROM\s+prisma\s+AS\s+migrator/.test(dockerfile)) {
  errors.push('Dockerfile must keep the migrator image based on the Prisma stage');
}

if (!dockerfile.includes('CMD ["pnpm", "db:migrate:deploy"]')) {
  errors.push('Dockerfile migrator target must run pnpm db:migrate:deploy');
}

if (errors.length > 0) {
  console.error('Runtime script validation failed');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Runtime script validation completed');

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return listFiles(fullPath);
    }

    return [fullPath];
  });
}

function toDisplayPath(filePath) {
  return relative(root, filePath).replaceAll('\\\\', '/');
}

function quote(value) {
  return `'${value}'`;
}

function doubleQuote(value) {
  return `"${value}"`;
}
