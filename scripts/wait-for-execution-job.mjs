import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Queue } from 'bullmq';

loadLocalEnvironment();

const [, , workspaceId, executionId, workflowId] = process.argv;

if (!workspaceId || !executionId || !workflowId) {
  throw new Error(
    'Usage: node scripts/wait-for-execution-job.mjs <workspaceId> <executionId> <workflowId>',
  );
}

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required');
}

const queueName = 'execution';
const jobName = 'execution.process';
const jobId = `execution.${workspaceId}.${executionId}`;
const timeoutMs = 20000;
const pollIntervalMs = 250;
const startedAt = Date.now();

const queue = new Queue(queueName, {
  connection: createBullMqRedisConnectionOptions(redisUrl),
  prefix: 'runlane',
});

try {
  await queue.waitUntilReady();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await queue.getJob(jobId);

    if (!job) {
      await delay(pollIntervalMs);
      continue;
    }

    assertExecutionJob(job.data, job.id, workspaceId, executionId, workflowId);

    const state = await job.getState();

    if (state === 'completed') {
      process.stdout.write(`Execution job completed for ${executionId}\n`);
      return;
    }

    if (state === 'failed') {
      throw new Error(`Execution job ${jobId} failed: ${job.failedReason ?? 'unknown failure'}`);
    }

    await delay(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for execution job ${jobId} to complete.`);
} finally {
  await queue.close();
}

function assertExecutionJob(
  data,
  actualJobId,
  expectedWorkspaceId,
  expectedExecutionId,
  expectedWorkflowId,
) {
  if (!data || typeof data !== 'object') {
    throw new Error('Execution job data was missing.');
  }

  if (actualJobId !== jobId || data.jobId !== jobId) {
    throw new Error('Execution job id mismatch.');
  }

  if (data.jobName !== jobName) {
    throw new Error('Execution job name mismatch.');
  }

  if (data.contractVersion !== 1) {
    throw new Error('Execution job contract version mismatch.');
  }

  if (data.payload?.workspaceId !== expectedWorkspaceId) {
    throw new Error('Execution job workspace mismatch.');
  }

  if (data.payload?.executionId !== expectedExecutionId) {
    throw new Error('Execution job execution mismatch.');
  }

  if (data.payload?.workflowId !== expectedWorkflowId) {
    throw new Error('Execution job workflow mismatch.');
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
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
