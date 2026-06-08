import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const lockfilePath = resolve(root, 'pnpm-lock.yaml');
const mode = process.argv.includes('--write') ? 'write' : 'check';
const registry = 'https://registry.npmjs.org/';
const internalRegistryPattern =
  /https?:\/\/packages\.applied-caas-gateway1\.internal\.api\.openai\.org\/artifactory\/api\/npm\/npm-public\//g;
const genericInternalRegistryPattern =
  /https?:\/\/[^\s'"{}]+\/artifactory\/api\/npm\/npm-public\//g;

if (!existsSync(lockfilePath)) {
  console.error('pnpm-lock.yaml is missing');
  process.exit(1);
}

const original = readFileSync(lockfilePath, 'utf8');
const normalized = normalizeLockfile(original);

if (mode === 'write') {
  if (normalized !== original) {
    writeFileSync(lockfilePath, normalized);
    console.log('pnpm lockfile registry URLs were normalized');
  } else {
    console.log('pnpm lockfile registry URLs are already normalized');
  }

  process.exit(0);
}

if (normalized !== original) {
  console.error('pnpm-lock.yaml contains non-public package registry tarball URLs');
  console.error('Run pnpm lockfile:registry and commit the updated pnpm-lock.yaml');
  process.exit(1);
}

if (original.includes('packages.applied-caas-gateway1.internal.api.openai.org')) {
  console.error('pnpm-lock.yaml still contains an internal package registry hostname');
  process.exit(1);
}

if (original.includes('artifactory/api/npm/npm-public')) {
  console.error('pnpm-lock.yaml still contains an internal package registry path');
  process.exit(1);
}

console.log('pnpm lockfile registry validation completed');

function normalizeLockfile(content) {
  return content
    .replace(internalRegistryPattern, registry)
    .replace(genericInternalRegistryPattern, registry);
}
