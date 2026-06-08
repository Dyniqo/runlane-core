import { PrismaClient } from './prisma-client-loader.mjs';

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
      status: 'SUCCEEDED',
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
    throw new Error('Processed execution was not persisted.');
  }

  if (execution.attempts !== 1) {
    throw new Error('Processed execution attempts must be incremented once.');
  }

  if (
    execution.outputJson === null ||
    execution.errorCode !== null ||
    execution.errorMessage !== null ||
    execution.durationMs === null ||
    execution.startedAt === null ||
    execution.finishedAt === null
  ) {
    throw new Error('Processed execution lifecycle fields were not finalized correctly.');
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

  if (execution.outputJson?.status !== 'succeeded') {
    throw new Error('Execution output did not include a succeeded status.');
  }

  if (execution.outputJson?.stepCount < 1) {
    throw new Error('Execution output did not include processed steps.');
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

  const startedAuditLog = await prisma.auditLog.findFirst({
    where: {
      workspaceId,
      action: 'execution.started',
      entityType: 'execution',
      entityId: executionId,
    },
    select: { id: true },
  });

  if (!startedAuditLog) {
    throw new Error('Execution started audit log was not persisted.');
  }

  const succeededAuditLog = await prisma.auditLog.findFirst({
    where: {
      workspaceId,
      action: 'execution.succeeded',
      entityType: 'execution',
      entityId: executionId,
    },
    select: { id: true },
  });

  if (!succeededAuditLog) {
    throw new Error('Execution succeeded audit log was not persisted.');
  }
} finally {
  await prisma.$disconnect();
}
