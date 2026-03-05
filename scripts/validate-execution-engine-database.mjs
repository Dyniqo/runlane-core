import { PrismaClient } from '@prisma/client';

const [, , email, executionId, expectedStepCount] = process.argv;

if (!email || !executionId || !expectedStepCount) {
  throw new Error(
    'Usage: node scripts/validate-execution-engine-database.mjs <email> <executionId> <expectedStepCount>',
  );
}

const expectedSteps = Number.parseInt(expectedStepCount, 10);
const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ownedWorkspaces: { select: { id: true } } },
  });
  const workspaceId = user?.ownedWorkspaces[0]?.id;

  if (!workspaceId) {
    throw new Error('Execution engine validation workspace was not found.');
  }

  const execution = await prisma.execution.findFirst({
    where: { id: executionId, workspaceId, status: 'SUCCEEDED' },
    select: {
      id: true,
      attempts: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
      durationMs: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (!execution) {
    throw new Error('Execution engine did not finalize the execution as succeeded.');
  }

  if (execution.attempts !== 1) {
    throw new Error('Execution engine did not increment attempts exactly once.');
  }

  if (
    execution.startedAt === null ||
    execution.finishedAt === null ||
    execution.durationMs === null ||
    execution.errorCode !== null ||
    execution.errorMessage !== null
  ) {
    throw new Error('Execution engine lifecycle fields were not finalized correctly.');
  }

  if (execution.outputJson?.status !== 'succeeded') {
    throw new Error('Execution engine output status mismatch.');
  }

  if (execution.outputJson?.stepCount !== expectedSteps) {
    throw new Error('Execution engine output step count mismatch.');
  }

  const steps = execution.outputJson?.steps;

  if (!Array.isArray(steps) || steps.length !== expectedSteps) {
    throw new Error('Execution engine output steps were not captured.');
  }

  for (const step of steps) {
    if (step?.status !== 'succeeded' || typeof step?.durationMs !== 'number') {
      throw new Error('Execution engine step snapshot is invalid.');
    }
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
    throw new Error('Execution engine did not persist the started audit event.');
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
    throw new Error('Execution engine did not persist the succeeded audit event.');
  }
} finally {
  await prisma.$disconnect();
}
