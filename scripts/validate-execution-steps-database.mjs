import prismaClientPackage from '@prisma/client';

const { PrismaClient } = prismaClientPackage;

const [, , email, succeededExecutionId, expectedStepCount, failedExecutionId] = process.argv;

if (!email || !succeededExecutionId || !expectedStepCount || !failedExecutionId) {
  throw new Error(
    'Usage: node scripts/validate-execution-steps-database.mjs <email> <succeededExecutionId> <expectedStepCount> <failedExecutionId>',
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
    throw new Error('Execution step validation workspace was not found.');
  }

  const succeededExecution = await prisma.execution.findFirst({
    where: { id: succeededExecutionId, workspaceId, status: 'SUCCEEDED' },
    select: {
      id: true,
      outputJson: true,
      durationMs: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (!succeededExecution) {
    throw new Error('Succeeded execution was not finalized.');
  }

  if (
    succeededExecution.startedAt === null ||
    succeededExecution.finishedAt === null ||
    succeededExecution.durationMs === null ||
    succeededExecution.outputJson?.stepCount !== expectedSteps
  ) {
    throw new Error('Succeeded execution lifecycle output is invalid.');
  }

  const succeededSteps = await prisma.executionStep.findMany({
    where: { workspaceId, executionId: succeededExecutionId },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      stepKey: true,
      type: true,
      status: true,
      inputJson: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
      durationMs: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (succeededSteps.length !== expectedSteps) {
    throw new Error('Succeeded execution step persistence count mismatch.');
  }

  const expectedStepKeys = ['ingest', 'route', 'complete'];

  for (const [index, step] of succeededSteps.entries()) {
    if (step.stepKey !== expectedStepKeys[index]) {
      throw new Error('Succeeded execution step order mismatch.');
    }

    if (
      step.type !== 'condition' ||
      step.status !== 'SUCCEEDED' ||
      step.errorCode !== null ||
      step.errorMessage !== null ||
      step.durationMs === null ||
      step.finishedAt === null ||
      step.outputJson?.branch === undefined ||
      step.inputJson?.workflow?.id === undefined ||
      step.inputJson?.step?.timeoutMs === undefined
    ) {
      throw new Error('Succeeded execution step snapshot is invalid.');
    }
  }

  const failedExecution = await prisma.execution.findFirst({
    where: { id: failedExecutionId, workspaceId, status: 'FAILED' },
    select: {
      id: true,
      errorCode: true,
      errorMessage: true,
      durationMs: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (!failedExecution) {
    throw new Error('Failed execution was not finalized.');
  }

  if (
    failedExecution.errorCode !== 'EXECUTION_STEP_RUNNER_MISSING' ||
    failedExecution.errorMessage === null ||
    failedExecution.startedAt === null ||
    failedExecution.finishedAt === null ||
    failedExecution.durationMs === null
  ) {
    throw new Error('Failed execution lifecycle output is invalid.');
  }

  const failedSteps = await prisma.executionStep.findMany({
    where: { workspaceId, executionId: failedExecutionId },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: {
      stepKey: true,
      type: true,
      status: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
      durationMs: true,
      finishedAt: true,
    },
  });

  if (failedSteps.length !== 1) {
    throw new Error('Failed execution should persist exactly one failed step.');
  }

  const failedStep = failedSteps[0];

  if (
    failedStep.stepKey !== 'external_call' ||
    failedStep.type !== 'http' ||
    failedStep.status !== 'FAILED' ||
    failedStep.outputJson !== null ||
    failedStep.errorCode !== 'EXECUTION_STEP_RUNNER_MISSING' ||
    failedStep.errorMessage === null ||
    failedStep.durationMs === null ||
    failedStep.finishedAt === null
  ) {
    throw new Error('Failed execution step error capture is invalid.');
  }
} finally {
  await prisma.$disconnect();
}
