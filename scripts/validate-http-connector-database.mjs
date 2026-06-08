import prismaClientPackage from '@prisma/client';

const { PrismaClient } = prismaClientPackage;

const [, , email, successExecutionId, blockedExecutionId, leadId, credentialValue] = process.argv;

if (!email || !successExecutionId || !blockedExecutionId || !leadId || !credentialValue) {
  throw new Error(
    'Usage: node scripts/validate-http-connector-database.mjs <email> <successExecutionId> <blockedExecutionId> <leadId> <credentialValue>',
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
    throw new Error('HTTP connector validation workspace was not found.');
  }

  const successExecution = await prisma.execution.findFirst({
    where: { id: successExecutionId, workspaceId },
    select: {
      id: true,
      status: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
      attempts: true,
    },
  });

  if (!successExecution) {
    throw new Error('HTTP connector success execution was not found.');
  }

  if (successExecution.status !== 'SUCCEEDED') {
    const successStep = await prisma.executionStep.findFirst({
      where: { workspaceId, executionId: successExecutionId, stepKey: 'send_lead' },
      select: { status: true, errorCode: true, errorMessage: true, outputJson: true },
    });
    throw new Error(
      `HTTP connector success execution did not succeed. Execution status=${successExecution.status}, attempts=${successExecution.attempts}, errorCode=${successExecution.errorCode}, errorMessage=${successExecution.errorMessage}, stepStatus=${successStep?.status}, stepErrorCode=${successStep?.errorCode}, stepErrorMessage=${successStep?.errorMessage}`,
    );
  }

  if (successExecution.errorCode !== null) {
    throw new Error('HTTP connector success execution persisted an unexpected error code.');
  }

  const successStep = await prisma.executionStep.findFirst({
    where: {
      workspaceId,
      executionId: successExecutionId,
      stepKey: 'send_lead',
      status: 'SUCCEEDED',
    },
    select: { inputJson: true, outputJson: true },
  });

  if (!successStep) {
    throw new Error('HTTP connector success step was not persisted.');
  }

  if (
    successStep.outputJson?.statusCode !== 200 ||
    successStep.outputJson?.body?.leadId !== leadId
  ) {
    throw new Error('HTTP connector response mapping did not persist the expected response body.');
  }

  const successSerialized = JSON.stringify({
    input: successStep.inputJson,
    output: successStep.outputJson,
    execution: successExecution.outputJson,
  });

  if (successSerialized.includes(credentialValue)) {
    throw new Error('HTTP connector persisted output leaked a raw credential value.');
  }

  const blockedExecution = await prisma.execution.findFirst({
    where: { id: blockedExecutionId, workspaceId, status: 'FAILED' },
    select: { errorCode: true, errorMessage: true, attempts: true },
  });

  if (!blockedExecution) {
    throw new Error('HTTP connector blocked execution did not fail safely.');
  }

  if (blockedExecution.errorCode !== 'HTTP_CONNECTOR_URL_BLOCKED') {
    throw new Error(
      `HTTP connector blocked execution error code mismatch: ${blockedExecution.errorCode}`,
    );
  }

  if (blockedExecution.attempts !== 1) {
    throw new Error('HTTP connector blocked execution should not be retried.');
  }

  const blockedStep = await prisma.executionStep.findFirst({
    where: {
      workspaceId,
      executionId: blockedExecutionId,
      stepKey: 'blocked_request',
      status: 'FAILED',
    },
    select: { errorCode: true, errorMessage: true },
  });

  if (!blockedStep || blockedStep.errorCode !== 'HTTP_CONNECTOR_URL_BLOCKED') {
    throw new Error('HTTP connector blocked step did not preserve the SSRF rejection error.');
  }
} finally {
  await prisma.$disconnect();
}
