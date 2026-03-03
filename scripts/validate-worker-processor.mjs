import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from 'redis';

loadLocalEnvironment();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required');
}

const redis = createClient({ url: redisUrl });
const startedAt = Date.now();

try {
  await redis.connect();
  const heartbeatKeys = await redis.keys('worker:*:heartbeat');

  if (heartbeatKeys.length === 0) {
    throw new Error('Worker heartbeat key was not found in Redis.');
  }

  const heartbeatPayloads = await Promise.all(
    heartbeatKeys.map(async (key) => ({ key, value: await redis.get(key) })),
  );
  const freshHeartbeat = heartbeatPayloads.find(({ value }) => {
    if (!value) {
      return false;
    }

    try {
      const parsed = JSON.parse(value);
      const heartbeatAt = Date.parse(parsed.heartbeatAt);

      return (
        typeof parsed.workerId === 'string' &&
        parsed.workerId.length > 0 &&
        Number.isFinite(heartbeatAt) &&
        heartbeatAt >= startedAt - 60000
      );
    } catch {
      return false;
    }
  });

  if (!freshHeartbeat) {
    throw new Error('Worker heartbeat payload was missing or stale.');
  }
} finally {
  await redis.quit();
}

function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    process.env[key] ??= value;
  }
}
