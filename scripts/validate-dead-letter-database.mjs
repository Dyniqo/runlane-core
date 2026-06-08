import prismaClientPackage from '@prisma/client';

const { PrismaClient } = prismaClientPackage;

const [, , email, executionId, phase] = process.argv;

if (!email || !executionId || !phase) {
  throw new Error(
    'Usage: node scripts/validate-dead-letter-database.mjs <email> <executionId> <initial|manual>',
  );
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ownedWorkspaces: { select: { id: true } } },
  });
  const workspaceId = user?.ownedWorkspaces[0]?.id;

  if (!workspaceId) {
    throw new Error('Dead-letter validation workspace was not found.');
  }

  const execution = await prisma.execution.findFirst({
    where: { id: executionId, workspaceId, status: 'DEAD_LETTER' },
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
    throw new Error('Execution was not persisted as dead letter.');
  }

  if (execution.attempts !== 3) {
    throw new Error(`Dead-letter attempts mismatch. Expected 3, received ${execution.attempts}.`);
  }

  if (execution.errorCode !== 'EXECUTION_STEP_TIMEOUT') {
    throw new Error('Dead-letter execution did not preserve the retryable error code.');
  }

  if (
    execution.startedAt === null ||
    execution.finishedAt === null ||
    execution.durationMs === null ||
    typeof execution.errorMessage !== 'string' ||
    !execution.errorMessage.includes('exceeded timeout')
  ) {
    throw new Error('Dead-letter execution lifecycle fields are incomplete.');
  }

  const deadLetterLogs = await prisma.auditLog.count({
    where: {
      workspaceId,
      action: 'execution.dead_lettered',
      entityType: 'execution',
      entityId: executionId,
    },
  });
  const manualRetryLogs = await prisma.auditLog.count({
    where: {
      workspaceId,
      action: 'execution.manual_retry_requested',
      entityType: 'execution',
      entityId: executionId,
    },
  });
  const enqueuedLogs = await prisma.auditLog.count({
    where: {
      workspaceId,
      action: 'execution.enqueued',
      entityType: 'execution',
      entityId: executionId,
    },
  });

  if (phase === 'initial') {
    if (deadLetterLogs !== 1 || manualRetryLogs !== 0) {
      throw new Error('Initial dead-letter audit state is invalid.');
    }
  } else if (phase === 'manual') {
    if (deadLetterLogs < 2 || manualRetryLogs !== 1 || enqueuedLogs < 2) {
      throw new Error('Manual retry audit state is invalid.');
    }
  } else {
    throw new Error(`Unsupported dead-letter validation phase '${phase}'.`);
  }
} finally {
  await prisma.$disconnect();
}
