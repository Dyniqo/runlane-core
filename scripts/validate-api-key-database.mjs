import { PrismaClient } from '@prisma/client';

const [, , email, apiKeyId, apiKeyPrefix] = process.argv;

if (!email || !apiKeyId || !apiKeyPrefix) {
  throw new Error('Email, API key id and API key prefix are required');
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      workspaceMemberships: {
        select: {
          role: true,
          workspaceId: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('Registered user was not persisted');
  }

  const ownerMembership = user.workspaceMemberships.find(
    (membership) => membership.role === 'OWNER',
  );

  if (!ownerMembership) {
    throw new Error('Owner workspace membership was not persisted');
  }

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: apiKeyId,
      workspaceId: ownerMembership.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      prefix: true,
      keyHash: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  if (!apiKey) {
    throw new Error('API key was not persisted in the workspace scope');
  }

  if (apiKey.prefix !== apiKeyPrefix) {
    throw new Error('API key prefix was not persisted correctly');
  }

  if (!apiKey.keyHash.startsWith('api-key:scrypt:v1$')) {
    throw new Error('API key hash format is invalid');
  }

  if (apiKey.keyHash.includes(apiKeyPrefix)) {
    throw new Error('API key hash includes the public prefix');
  }

  if (!apiKey.revokedAt) {
    throw new Error('API key revocation was not persisted');
  }

  const workspaceScopedCount = await prisma.apiKey.count({
    where: {
      workspaceId: ownerMembership.workspaceId,
      prefix: apiKeyPrefix,
    },
  });

  if (workspaceScopedCount !== 1) {
    throw new Error('Workspace-scoped API key prefix lookup is invalid');
  }
} finally {
  await prisma.$disconnect();
}
