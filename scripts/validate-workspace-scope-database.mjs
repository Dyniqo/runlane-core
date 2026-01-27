import { PrismaClient } from '@prisma/client';

const [, , email, expectedWorkspaceName] = process.argv;

if (!email || !expectedWorkspaceName) {
  throw new Error('Email and expected workspace name are required');
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
          workspace: {
            select: {
              id: true,
              name: true,
              ownerId: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error('Registered user was not persisted');
  }

  const ownerMembership = user.workspaceMemberships.find(
    (membership) => membership.role === 'OWNER' && membership.workspace.ownerId === user.id,
  );

  if (!ownerMembership) {
    throw new Error('Owner workspace membership was not persisted');
  }

  if (ownerMembership.workspace.name !== expectedWorkspaceName) {
    throw new Error('Workspace name update was not persisted');
  }

  const membershipCount = await prisma.workspaceMember.count({
    where: { workspaceId: ownerMembership.workspace.id, userId: user.id },
  });

  if (membershipCount !== 1) {
    throw new Error('Workspace membership uniqueness is invalid');
  }
} finally {
  await prisma.$disconnect();
}
