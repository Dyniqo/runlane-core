import { PrismaClient } from './prisma-client-loader.mjs';

const [, , email, workspaceId, apiKeyId] = process.argv;

if (!email || !workspaceId || !apiKeyId) {
  throw new Error('Email, workspace id and API key id are required');
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      workspaceMemberships: {
        select: {
          workspaceId: true,
          role: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('Audit validation user was not persisted');
  }

  const membership = user.workspaceMemberships.find(
    (item) => item.workspaceId === workspaceId && item.role === 'OWNER',
  );

  if (!membership) {
    throw new Error('Audit validation workspace membership was not persisted');
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
      metadataJson: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  });

  const actions = new Set(auditLogs.map((auditLog) => auditLog.action));
  const requiredActions = [
    'identity.user_registered',
    'identity.user_logged_in',
    'identity.session_refreshed',
    'identity.session_logged_out',
    'workspace.updated',
    'access.api_key_created',
    'access.api_key_revoked',
  ];

  for (const action of requiredActions) {
    if (!actions.has(action)) {
      throw new Error(`Audit action ${action} was not persisted`);
    }
  }

  const foreignAuditLogCount = await prisma.auditLog.count({
    where: {
      workspaceId: { not: workspaceId },
      actorUserId: user.id,
    },
  });

  if (foreignAuditLogCount !== 0) {
    throw new Error('Audit logs leaked outside the workspace scope');
  }

  const apiKeyAuditLogs = auditLogs.filter((auditLog) => auditLog.entityId === apiKeyId);

  if (apiKeyAuditLogs.length < 2) {
    throw new Error('API key audit events were not persisted');
  }

  for (const auditLog of apiKeyAuditLogs) {
    const metadata = JSON.stringify(auditLog.metadataJson);

    if (metadata.includes('keyHash') || metadata.includes('token')) {
      throw new Error('API key audit metadata contains credential material');
    }
  }
} finally {
  await prisma.$disconnect();
}
