import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const scriptDirectory = join(root, 'scripts');
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

const preflightContent = readFileSync(
  join(root, 'scripts/database-migration-preflight.mjs'),
  'utf8',
);

if (!preflightContent.includes("import { PrismaClient } from './prisma-client-loader.mjs';")) {
  errors.push('database-migration-preflight.mjs must use the shared Prisma client loader');
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
  return `'${value}';`;
}

function doubleQuote(value) {
  return `"${value}";`;
}
