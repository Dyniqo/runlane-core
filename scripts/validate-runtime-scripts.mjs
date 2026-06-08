import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const packageJsonPath = resolve(root, 'package.json');
const dockerfilePath = resolve(root, 'Dockerfile');
const scriptsDirectory = resolve(root, 'scripts');
const failures = [];

if (!existsSync(packageJsonPath)) {
  failures.push('package.json is missing');
}

if (!existsSync(dockerfilePath)) {
  failures.push('Dockerfile is missing');
}

if (!existsSync(scriptsDirectory)) {
  failures.push('scripts directory is missing');
}

if (failures.length === 0) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const dockerfile = readFileSync(dockerfilePath, 'utf8');
  const runtimeScripts = readRuntimeScripts(scriptsDirectory);

  if (
    packageJson.scripts['db:migrate:deploy'] !==
    'pnpm db:generate && pnpm db:migrate:preflight && prisma migrate deploy'
  ) {
    failures.push(
      'package.json script db:migrate:deploy must generate Prisma Client before migration preflight',
    );
  }

  if (
    packageJson.scripts['db:migrate:deploy:runtime'] !==
    'pnpm db:migrate:preflight && prisma migrate deploy'
  ) {
    failures.push(
      'package.json script db:migrate:deploy:runtime must run migration preflight without runtime generation',
    );
  }

  if (
    packageJson.scripts['validate:runtime-scripts'] !== 'node scripts/validate-runtime-scripts.mjs'
  ) {
    failures.push(
      'package.json script validate:runtime-scripts must run node scripts/validate-runtime-scripts.mjs',
    );
  }

  if (!packageJson.scripts.verify.includes('pnpm validate:runtime-scripts')) {
    failures.push('package.json verify script must include pnpm validate:runtime-scripts');
  }

  requireFragments('Dockerfile', dockerfile, [
    'ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY',
    'RUN pnpm build',
    'FROM prisma AS migrator',
    'CMD ["pnpm", "db:migrate:deploy:runtime"]',
  ]);

  forbidFragments('Dockerfile', dockerfile, [
    'ENV npm_config_registry=',
    'CMD ["pnpm", "db:migrate:deploy"]',
  ]);

  const preflightScript = readFileSync(
    resolve(root, 'scripts/database-migration-preflight.mjs'),
    'utf8',
  );

  requireFragments('scripts/database-migration-preflight.mjs', preflightScript, [
    "import prismaClientPackage from '@prisma/client';",
    'const { PrismaClient } = prismaClientPackage;',
    'await prisma.$disconnect();',
  ]);

  forbidFragments('scripts/database-migration-preflight.mjs', preflightScript, [
    `import { PrismaClient } from '@${'prisma'}/client';`,
  ]);

  for (const scriptPath of runtimeScripts) {
    const relativePath = scriptPath.slice(root.length + 1).replaceAll('\\\\', '/');
    const content = readFileSync(scriptPath, 'utf8');

    if (/import\s+\{\s*PrismaClient\s*\}\s+from\s+['"]@prisma\/client['"]/.test(content)) {
      failures.push(`${relativePath} must not named-import PrismaClient from @prisma/client`);
    }
  }
}

if (failures.length > 0) {
  console.error('Runtime script validation failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Runtime script validation completed');

function readRuntimeScripts(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...readRuntimeScripts(path));
      continue;
    }

    if (entry.endsWith('.mjs')) {
      files.push(path);
    }
  }

  return files;
}

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
