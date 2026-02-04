import { PrismaClient } from '@prisma/client';

const [email, workflowId] = process.argv.slice(2);

if (!email || !workflowId) {
  process.stderr.write('Usage: node scripts/validate-workflow-database.mjs <email> <workflowId>\n');
  process.exit(1);
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
        },
        take: 1,
      },
    },
  });

  if (!user) {
    throw new Error(`User ${email} was not found.`);
  }

  const membership = user.workspaceMemberships[0];

  if (!membership) {
    throw new Error(`User ${email} has no workspace membership.`);
  }

  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      workspaceId: membership.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      status: true,
      version: true,
      triggerType: true,
      definitionJson: true,
      publishedAt: true,
    },
  });

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} was not stored in the expected workspace.`);
  }

  if (workflow.status !== 'PUBLISHED') {
    throw new Error(`Expected workflow status PUBLISHED but received ${workflow.status}.`);
  }

  if (workflow.version !== 2) {
    throw new Error(`Expected workflow version 2 but received ${workflow.version}.`);
  }

  if (workflow.triggerType !== 'webhook') {
    throw new Error(`Expected trigger type webhook but received ${workflow.triggerType}.`);
  }

  if (!workflow.publishedAt) {
    throw new Error('Expected workflow publishedAt to be stored.');
  }

  if (workflow.definitionJson?.schemaVersion !== 1) {
    throw new Error('Expected workflow definition schemaVersion 1.');
  }

  if (workflow.definitionJson?.entryStepKey !== 'qualify_lead') {
    throw new Error('Expected workflow definition entryStepKey qualify_lead.');
  }

  const auditActions = await prisma.auditLog.findMany({
    where: {
      workspaceId: membership.workspaceId,
      entityType: 'workflow',
      entityId: workflowId,
    },
    select: {
      action: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const actionNames = new Set(auditActions.map((action) => action.action));

  if (!actionNames.has('workflow.created')) {
    throw new Error('Workflow creation audit log was not persisted.');
  }

  if (!actionNames.has('workflow.updated')) {
    throw new Error('Workflow update audit log was not persisted.');
  }

  if (!actionNames.has('workflow.published')) {
    throw new Error('Workflow publish audit log was not persisted.');
  }
} finally {
  await prisma.$disconnect();
}
