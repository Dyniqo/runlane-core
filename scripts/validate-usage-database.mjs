import { PrismaClient } from './prisma-client-loader.mjs';

const [, , email, webhookExecutionId, httpExecutionId, aiExecutionId, retryExecutionId] =
  process.argv;

if (!email || !webhookExecutionId || !httpExecutionId || !aiExecutionId || !retryExecutionId) {
  throw new Error(
    'Usage: node scripts/validate-usage-database.mjs <email> <webhookExecutionId> <httpExecutionId> <aiExecutionId> <retryExecutionId>',
  );
}

const prisma = new PrismaClient();

try {
  await main();
} finally {
  await prisma.$disconnect();
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ownedWorkspaces: { select: { id: true } } },
  });
  const workspaceId = user?.ownedWorkspaces[0]?.id;

  if (!workspaceId) {
    throw new Error('Usage validation workspace was not found.');
  }

  const usageRecords = await prisma.usageRecord.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      type: true,
      quantity: true,
      sourceType: true,
      sourceId: true,
      metadataJson: true,
    },
  });

  if (usageRecords.length === 0) {
    throw new Error('Usage records were not persisted.');
  }

  assertExecutionUsage(usageRecords, [
    webhookExecutionId,
    httpExecutionId,
    aiExecutionId,
    retryExecutionId,
  ]);
  assertMetric(usageRecords, 'WEBHOOK_REQUEST', 'webhook_request', 1);
  assertMetricForExecution(usageRecords, 'HTTP_CALL', httpExecutionId);
  assertMetricForExecution(usageRecords, 'AI_CALL', aiExecutionId);
  assertRetryUsage(usageRecords, retryExecutionId);

  const grouped = await prisma.usageRecord.groupBy({
    by: ['type'],
    where: { workspaceId },
    _sum: { quantity: true },
  });
  const totals = Object.fromEntries(grouped.map((row) => [row.type, row._sum.quantity ?? 0]));

  if ((totals.EXECUTION ?? 0) < 4) {
    throw new Error(`Execution usage total is too low: ${totals.EXECUTION ?? 0}`);
  }

  if ((totals.WEBHOOK_REQUEST ?? 0) < 1) {
    throw new Error(`Webhook usage total is too low: ${totals.WEBHOOK_REQUEST ?? 0}`);
  }

  if ((totals.HTTP_CALL ?? 0) < 1) {
    throw new Error(`HTTP usage total is too low: ${totals.HTTP_CALL ?? 0}`);
  }

  if ((totals.AI_CALL ?? 0) < 1) {
    throw new Error(`AI usage total is too low: ${totals.AI_CALL ?? 0}`);
  }

  if ((totals.RETRY ?? 0) < 1) {
    throw new Error(`Retry usage total is too low: ${totals.RETRY ?? 0}`);
  }
}

function assertExecutionUsage(records, executionIds) {
  const executionRecords = records.filter((record) => record.type === 'EXECUTION');

  for (const executionId of executionIds) {
    const matching = executionRecords.find((record) => record.sourceId === executionId);

    if (!matching) {
      throw new Error(`Execution usage record was not found for ${executionId}.`);
    }

    if (matching.quantity !== 1 || matching.sourceType !== 'execution') {
      throw new Error(`Execution usage record is invalid for ${executionId}.`);
    }
  }
}

function assertMetric(records, type, sourceType, minimumQuantity) {
  const quantity = records
    .filter((record) => record.type === type && record.sourceType === sourceType)
    .reduce((sum, record) => sum + record.quantity, 0);

  if (quantity < minimumQuantity) {
    throw new Error(`${type} usage quantity is too low: ${quantity}.`);
  }
}

function assertMetricForExecution(records, type, executionId) {
  const matching = records.find(
    (record) =>
      record.type === type &&
      record.sourceType === 'execution_step' &&
      String(record.sourceId).includes(executionId),
  );

  if (!matching) {
    throw new Error(`${type} usage record was not found for execution ${executionId}.`);
  }

  if (matching.quantity !== 1) {
    throw new Error(`${type} usage quantity is invalid for execution ${executionId}.`);
  }

  if (matching.metadataJson?.executionId !== executionId) {
    throw new Error(`${type} usage metadata execution id mismatch.`);
  }
}

function assertRetryUsage(records, executionId) {
  const retryRecords = records.filter(
    (record) =>
      record.type === 'RETRY' &&
      record.sourceType === 'execution_retry' &&
      String(record.sourceId).includes(executionId),
  );

  if (retryRecords.length < 1) {
    throw new Error(`Retry usage was not recorded for execution ${executionId}.`);
  }

  for (const record of retryRecords) {
    if (record.quantity !== 1) {
      throw new Error('Retry usage quantity is invalid.');
    }

    if (record.metadataJson?.executionId !== executionId) {
      throw new Error('Retry usage metadata execution id mismatch.');
    }
  }
}
