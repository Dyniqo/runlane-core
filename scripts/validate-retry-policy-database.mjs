import { PrismaClient } from '@prisma/client';

const [, , email, executionId, expectedAttemptsInput] = process.argv;

if (!email || !executionId || !expectedAttemptsInput) {
  throw new Error(
    'Usage: node scripts/validate-retry-policy-database.mjs <email> <executionId> <expectedAttempts>',
  );
}

const expectedAttempts = Number.parseInt(expectedAttemptsInput, 10);
const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ownedWorkspaces: { select: { id: true } } },
  });
  const workspaceId = user?.ownedWorkspaces[0]?.id;

  if (!workspaceId) {
    throw new Error('Retry policy validation workspace was not found.');
  }

  const execution = await prisma.execution.findFirst({
    where: { id: executionId, workspaceId, status: 'FAILED' },
    select: {
      id: true,
      attempts: true,
      errorCode: true,
      errorMessage: true,
      durationMs: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (!execution) {
    throw new Error('Retry policy did not finalize the execution as failed after retries.');
  }

  if (execution.attempts !== expectedAttempts) {
    throw new Error(
      `Retry policy attempts mismatch. Expected ${expectedAttempts}, received ${execution.attempts}.`,
    );
  }

  if (execution.errorCode !== 'EXECUTION_STEP_TIMEOUT') {
    throw new Error('Retry policy did not preserve the retryable error classification.');
  }

  if (
    execution.startedAt === null ||
    execution.finishedAt === null ||
    execution.durationMs === null ||
    typeof execution.errorMessage !== 'string' ||
    !execution.errorMessage.includes('exceeded timeout')
  ) {
    throw new Error('Retry policy did not persist final failure lifecycle fields.');
  }

  const retryLogs = await prisma.auditLog.findMany({
    where: {
      workspaceId,
      action: 'execution.retrying',
      entityType: 'execution',
      entityId: executionId,
    },
    orderBy: { createdAt: 'asc' },
    select: { metadataJson: true },
  });

  if (retryLogs.length !== expectedAttempts - 1) {
    throw new Error('Retry policy did not persist the expected retry audit events.');
  }

  const retryDelays = retryLogs.map((log) => log.metadataJson?.retryDelayMs);

  if (!retryDelays.every((delay) => typeof delay === 'number' && delay > 0)) {
    throw new Error('Retry policy did not persist retry delays.');
  }

  for (let index = 1; index < retryDelays.length; index += 1) {
    if (retryDelays[index] < retryDelays[index - 1]) {
      throw new Error('Retry policy delays are not monotonic.');
    }
  }

  const failedStep = await prisma.executionStep.findFirst({
    where: { workspaceId, executionId, stepKey: 'transient_timeout', status: 'FAILED' },
    select: { errorCode: true, errorMessage: true, durationMs: true, finishedAt: true },
  });

  if (
    !failedStep ||
    failedStep.errorCode !== 'EXECUTION_STEP_TIMEOUT' ||
    failedStep.finishedAt === null ||
    failedStep.durationMs === null
  ) {
    throw new Error('Retry policy did not persist the final failed step state.');
  }
} finally {
  await prisma.$disconnect();
}
