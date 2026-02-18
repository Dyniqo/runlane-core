import { PrismaClient } from '@prisma/client';

const [, , email, executionId, sourceId, triggerType] = process.argv;

if (!email || !executionId || !sourceId || !triggerType) {
  throw new Error(
    'Usage: node scripts/validate-execution-database.mjs <email> <executionId> <sourceId> <triggerType>',
  );
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      ownedWorkspaces: {
        select: {
          id: true,
        },
      },
    },
  });

  const workspaceId = user?.ownedWorkspaces[0]?.id;

  if (!workspaceId) {
    throw new Error('Execution validation workspace was not found.');
  }

  const execution = await prisma.execution.findFirst({
    where: {
      id: executionId,
      workspaceId,
      status: 'QUEUED',
    },
    select: {
      id: true,
      workflowId: true,
      attempts: true,
      inputJson: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
      durationMs: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
    },
  });

  if (!execution) {
    throw new Error('Queued execution was not persisted.');
  }

  if (execution.attempts !== 0) {
    throw new Error('Queued execution attempts must start at zero.');
  }

  if (
    execution.outputJson !== null ||
    execution.errorCode !== null ||
    execution.errorMessage !== null ||
    execution.durationMs !== null ||
    execution.startedAt !== null ||
    execution.finishedAt !== null
  ) {
    throw new Error('Queued execution lifecycle fields were not initialized correctly.');
  }

  if (execution.inputJson?.trigger?.type !== triggerType) {
    throw new Error('Execution trigger type mismatch.');
  }

  if (execution.inputJson?.trigger?.sourceId !== sourceId) {
    throw new Error('Execution trigger source id mismatch.');
  }

  if (execution.inputJson?.trigger?.workflowVersion < 1) {
    throw new Error('Execution trigger did not include workflow version.');
  }

  const executionAuditLog = await prisma.auditLog.findFirst({
    where: {
      workspaceId,
      action: 'execution.created',
      entityType: 'execution',
      entityId: executionId,
    },
    select: {
      id: true,
      metadataJson: true,
    },
  });

  if (!executionAuditLog) {
    throw new Error('Execution creation audit log was not persisted.');
  }

  if (executionAuditLog.metadataJson?.triggerType !== triggerType) {
    throw new Error('Execution audit trigger type mismatch.');
  }

  if (executionAuditLog.metadataJson?.sourceId !== sourceId) {
    throw new Error('Execution audit source id mismatch.');
  }
} finally {
  await prisma.$disconnect();
}
