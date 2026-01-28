import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runtimeName = process.argv[2];
const allowedRuntimes = new Set(['api', 'worker']);

if (!allowedRuntimes.has(runtimeName)) {
  process.stderr.write('Usage: node scripts/start-dev-runtime.mjs <api|worker>\n');
  process.exit(1);
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeOutputDirectory = path.join(rootDirectory, '.run', runtimeName);
const nestCliPath = path.join(rootDirectory, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

if (!existsSync(nestCliPath)) {
  process.stderr.write(
    'Nest CLI was not found. Run pnpm install --frozen-lockfile before starting a development runtime.\n',
  );
  process.exit(1);
}

rmSync(runtimeOutputDirectory, { force: true, recursive: true });

const child = spawn(
  process.execPath,
  [
    nestCliPath,
    'start',
    runtimeName,
    '--watch',
    '--path',
    `apps/${runtimeName}/tsconfig.dev.json`,
    '--webpackPath',
    `webpack.${runtimeName}.dev.cjs`,
  ],
  {
    cwd: rootDirectory,
    env: {
      ...process.env,
      CHOKIDAR_USEPOLLING: 'false',
      WATCHPACK_POLLING: 'false',
    },
    stdio: 'inherit',
    windowsHide: false,
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exitCode = code;
    return;
  }

  process.exitCode = signal === 'SIGINT' ? 130 : 1;
});

child.on('error', (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
