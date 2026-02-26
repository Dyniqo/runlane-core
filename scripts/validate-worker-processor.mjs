import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Queue, QueueEvents } from 'bullmq';
import { createClient } from 'redis';

loadLocalEnvironment();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required');
}

const queueName = 'execution';
const jobName = 'execution.process';
const workspaceId = randomUUID();
const executionId = randomUUID();
const workflowId = randomUUID();
const jobId = `execution.${workspaceId}.${executionId}`;
const startedAt = Date.now();

const queue = new Queue(queueName, {
  connection: createBullMqRedisConnectionOptions(redisUrl),
  prefix: 'runlane',
});
const queueEvents = new QueueEvents(queueName, {
  connection: createBullMqRedisConnectionOptions(redisUrl),
  prefix: 'runlane',
});
const redis = createClient({ url: redisUrl });

try {
  await Promise.all([queue.waitUntilReady(), queueEvents.waitUntilReady(), redis.connect()]);

  const job = await queue.add(
    jobName,
    {
      contractVersion: 1,
      jobId,
      jobName,
      correlationId: randomUUID(),
      enqueuedAt: new Date().toISOString(),
      payload: {
        workspaceId,
        executionId,
        workflowId,
        isDemo: false,
      },
    },
    {
      jobId,
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  );

  await job.waitUntilFinished(queueEvents, 15000);

  const completedJob = await queue.getJob(jobId);
  const state = await completedJob?.getState();

  if (state !== 'completed') {
    throw new Error(`Expected worker job to be completed but received '${state ?? 'missing'}'.`);
  }

  await completedJob?.remove();

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
  await Promise.allSettled([queue.close(), queueEvents.close(), redis.quit()]);
}

function createBullMqRedisConnectionOptions(url) {
  const parsedUrl = new URL(url);
  const database = Number.parseInt(parsedUrl.pathname.replace(/^\//, '') || '0', 10);
  const options = {
    host: parsedUrl.hostname,
    port: Number.parseInt(parsedUrl.port || '6379', 10),
    db: Number.isInteger(database) && database >= 0 ? database : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };

  if (parsedUrl.username) {
    options.username = decodeURIComponent(parsedUrl.username);
  }

  if (parsedUrl.password) {
    options.password = decodeURIComponent(parsedUrl.password);
  }

  if (parsedUrl.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
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
