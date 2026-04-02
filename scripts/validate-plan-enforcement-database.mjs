import { PrismaClient } from '@prisma/client';

const [, , command, ...args] = process.argv;
const prisma = new PrismaClient();

try {
  await main();
} finally {
  await prisma.$disconnect();
}

async function main() {
  if (command === 'seed-usage') {
    const [email, metric, quantityRaw, seedId] = args;
    await seedUsage(email, metric, quantityRaw, seedId);
    return;
  }

  if (command === 'assert-execution-failed') {
    const [email, executionId, expectedCode] = args;
    await assertExecutionFailed(email, executionId, expectedCode);
    return;
  }

  throw new Error(
    'Usage: node scripts/validate-plan-enforcement-database.mjs <seed-usage|assert-execution-failed> ...',
  );
}

async function seedUsage(email, metric, quantityRaw, seedId) {
  if (!email || !metric || !quantityRaw || !seedId) {
    throw new Error('Usage: seed-usage <email> <metric> <quantity> <seedId>');
  }

  const quantity = Number(quantityRaw);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
    throw new Error('Seed usage quantity is invalid.');
  }

  const workspaceId = await findWorkspaceId(email);
  const type = mapMetricType(metric);
  const now = new Date();
  const records = Array.from({ length: quantity }, (_, index) => ({
    workspaceId,
    type,
    quantity: 1,
    sourceType: 'plan_validation_seed',
    sourceId: `${seedId}:${metric}:${index}`,
    metadataJson: { seedId, metric, index },
    createdAt: now,
  }));

  await prisma.usageRecord.createMany({ data: records, skipDuplicates: true });
}

async function assertExecutionFailed(email, executionId, expectedCode) {
  if (!email || !executionId || !expectedCode) {
    throw new Error('Usage: assert-execution-failed <email> <executionId> <expectedCode>');
  }

  const workspaceId = await findWorkspaceId(email);
  const execution = await prisma.execution.findFirst({
    where: { id: executionId, workspaceId },
    select: {
      id: true,
      status: true,
      attempts: true,
      errorCode: true,
      errorMessage: true,
      steps: {
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        select: {
          stepKey: true,
          status: true,
          errorCode: true,
          errorMessage: true,
        },
      },
    },
  });

  if (!execution) {
    throw new Error(`Execution ${executionId} was not found.`);
  }

  if (execution.status !== 'FAILED') {
    throw new Error(`Expected execution ${executionId} to fail, got ${execution.status}.`);
  }

  if (execution.attempts !== 1) {
    throw new Error(
      `Expected execution ${executionId} to fail without retry, got ${execution.attempts} attempts.`,
    );
  }

  if (execution.errorCode !== expectedCode) {
    throw new Error(
      `Expected execution error ${expectedCode}, got ${execution.errorCode}: ${execution.errorMessage ?? ''}`,
    );
  }

  const failedStep = execution.steps.find((step) => step.status === 'FAILED');

  if (!failedStep) {
    throw new Error(`Execution ${executionId} did not persist a failed step.`);
  }

  if (failedStep.errorCode !== expectedCode) {
    throw new Error(
      `Expected failed step error ${expectedCode}, got ${failedStep.errorCode}: ${failedStep.errorMessage ?? ''}`,
    );
  }
}

async function findWorkspaceId(email) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ownedWorkspaces: { select: { id: true }, take: 1 } },
  });

  const workspaceId = user?.ownedWorkspaces[0]?.id;

  if (!workspaceId) {
    throw new Error(`Workspace for ${email} was not found.`);
  }

  return workspaceId;
}

function mapMetricType(metric) {
  if (metric === 'execution') {
    return 'EXECUTION';
  }

  if (metric === 'ai_call') {
    return 'AI_CALL';
  }

  if (metric === 'http_call') {
    return 'HTTP_CALL';
  }

  if (metric === 'webhook_request') {
    return 'WEBHOOK_REQUEST';
  }

  if (metric === 'retry') {
    return 'RETRY';
  }

  throw new Error(`Unsupported usage metric '${metric}'.`);
}
