import prismaClientPackage from '@prisma/client';

const { PrismaClient } = prismaClientPackage;

const [, , email, workflowId, webhookRequestId, executionId, idempotencyKey] = process.argv;

if (!email || !workflowId || !webhookRequestId || !executionId || !idempotencyKey) {
  throw new Error(
    'Usage: node scripts/validate-webhook-database.mjs <email> <workflowId> <webhookRequestId> <executionId> <idempotencyKey>',
  );
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      ownedWorkspaces: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('Validation user was not found.');
  }

  const workspaceId = user.ownedWorkspaces[0]?.id;

  if (!workspaceId) {
    throw new Error('Validation workspace was not found.');
  }

  const request = await prisma.webhookRequest.findFirst({
    where: {
      id: webhookRequestId,
      workflowId,
      workspaceId,
      idempotencyKey,
      status: 'ACCEPTED',
    },
    select: {
      id: true,
      payloadHash: true,
      source: true,
      signature: true,
    },
  });

  if (!request) {
    throw new Error('Webhook request was not persisted with the expected workspace scope.');
  }

  if (!/^[a-f0-9]{64}$/.test(request.payloadHash)) {
    throw new Error('Webhook payload hash was not persisted correctly.');
  }

  if (request.source !== 'website_form') {
    throw new Error('Webhook source was not normalized and persisted.');
  }

  if (!/^t=\d{10,},v1=[a-f0-9]{64}$/.test(request.signature ?? '')) {
    throw new Error('Webhook signature metadata was not persisted in the signed format.');
  }

  const execution = await prisma.execution.findFirst({
    where: {
      id: executionId,
      workflowId,
      workspaceId,
      status: 'SUCCEEDED',
    },
    select: {
      id: true,
      inputJson: true,
      outputJson: true,
      attempts: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
    },
  });

  if (!execution) {
    throw new Error('Webhook execution was not persisted with the expected workspace scope.');
  }

  if (
    execution.attempts !== 1 ||
    execution.startedAt === null ||
    execution.finishedAt === null ||
    execution.durationMs === null ||
    execution.outputJson === null
  ) {
    throw new Error('Webhook execution lifecycle fields were not finalized correctly.');
  }

  if (execution.inputJson?.trigger?.type !== 'webhook') {
    throw new Error('Webhook execution trigger type was not persisted.');
  }

  if (execution.inputJson?.trigger?.sourceId !== webhookRequestId) {
    throw new Error('Webhook execution trigger source id does not match the webhook request.');
  }

  if (execution.inputJson?.metadata?.payloadHash !== request.payloadHash) {
    throw new Error('Webhook execution metadata does not include the payload hash.');
  }

  if (execution.outputJson?.status !== 'succeeded') {
    throw new Error('Webhook execution output was not finalized as succeeded.');
  }

  const idempotentRequestCount = await prisma.webhookRequest.count({
    where: {
      workspaceId,
      workflowId,
      idempotencyKey,
      status: 'ACCEPTED',
    },
  });

  if (idempotentRequestCount !== 1) {
    throw new Error('Webhook idempotency did not preserve a single accepted request.');
  }

  const idempotentExecutionCount = await prisma.execution.count({
    where: {
      workspaceId,
      workflowId,
      inputJson: {
        path: ['trigger', 'sourceId'],
        equals: webhookRequestId,
      },
    },
  });

  if (idempotentExecutionCount !== 1) {
    throw new Error('Webhook idempotency did not preserve a single execution.');
  }

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      workspaceId,
      action: 'ingestion.webhook_received',
      entityType: 'webhook_request',
      entityId: webhookRequestId,
    },
    select: {
      id: true,
      metadataJson: true,
    },
  });

  if (!auditLog) {
    throw new Error('Webhook audit log was not persisted.');
  }

  if (auditLog.metadataJson?.workflowId !== workflowId) {
    throw new Error('Webhook audit metadata did not include the workflow id.');
  }

  if (auditLog.metadataJson?.executionId !== executionId) {
    throw new Error('Webhook audit metadata did not include the execution id.');
  }

  if (typeof auditLog.metadataJson?.signatureTimestampSeconds !== 'number') {
    throw new Error('Webhook audit metadata did not include the signature timestamp.');
  }
} finally {
  await prisma.$disconnect();
}
