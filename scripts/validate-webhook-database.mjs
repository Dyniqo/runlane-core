import { PrismaClient } from '@prisma/client';

const [, , email, workflowId, webhookRequestId, idempotencyKey] = process.argv;

if (!email || !workflowId || !webhookRequestId || !idempotencyKey) {
  throw new Error(
    'Usage: node scripts/validate-webhook-database.mjs <email> <workflowId> <webhookRequestId> <idempotencyKey>',
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

  if (typeof auditLog.metadataJson?.signatureTimestampSeconds !== 'number') {
    throw new Error('Webhook audit metadata did not include the signature timestamp.');
  }
} finally {
  await prisma.$disconnect();
}
