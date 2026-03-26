import { PrismaClient } from '@prisma/client';

const [, , email, executionId, leadId, expectedSuccessValue] = process.argv;

if (!email || !executionId || !leadId || !expectedSuccessValue) {
  throw new Error(
    'Usage: node scripts/validate-notifications-database.mjs <email> <executionId> <leadId> <expectedSuccess>',
  );
}

const expectedSuccess = expectedSuccessValue === 'true';
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
    throw new Error('Notification validation workspace was not found.');
  }

  const execution = await prisma.execution.findFirst({
    where: { id: executionId, workspaceId },
    select: {
      id: true,
      status: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
      attempts: true,
    },
  });

  if (!execution) {
    throw new Error('Notification execution was not found.');
  }

  const notificationStep = await prisma.executionStep.findFirst({
    where: { workspaceId, executionId, stepKey: 'notify_team' },
    select: {
      status: true,
      inputJson: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
    },
  });

  if (!notificationStep) {
    throw new Error('Notification step was not persisted.');
  }

  if (!expectedSuccess) {
    assertMissingWebhookFailure(execution, notificationStep);
    return;
  }

  assertSuccessfulNotification(execution, notificationStep, leadId);
}

function assertMissingWebhookFailure(execution, notificationStep) {
  if (execution.status !== 'FAILED') {
    throw new Error(
      `Notification execution should fail safely without a webhook. status=${execution.status}`,
    );
  }

  if (execution.errorCode !== 'NOTIFICATION_WEBHOOK_MISSING') {
    throw new Error(
      `Notification missing-webhook error code mismatch: ${execution.errorCode} ${execution.errorMessage}`,
    );
  }

  if (execution.attempts !== 1) {
    throw new Error('Notification missing-webhook execution should not be retried.');
  }

  if (
    notificationStep.status !== 'FAILED' ||
    notificationStep.errorCode !== 'NOTIFICATION_WEBHOOK_MISSING'
  ) {
    throw new Error('Notification missing-webhook step did not preserve configuration error.');
  }
}

function assertSuccessfulNotification(execution, notificationStep, leadId) {
  if (execution.status !== 'SUCCEEDED') {
    throw new Error(
      `Notification execution did not succeed. status=${execution.status}, attempts=${execution.attempts}, errorCode=${execution.errorCode}, errorMessage=${execution.errorMessage}, stepStatus=${notificationStep.status}, stepErrorCode=${notificationStep.errorCode}, stepErrorMessage=${notificationStep.errorMessage}`,
    );
  }

  if (notificationStep.status !== 'SUCCEEDED') {
    throw new Error('Notification step did not succeed.');
  }

  const output = notificationStep.outputJson;

  if (output?.notification?.delivered !== true) {
    throw new Error('Notification step output did not record successful delivery.');
  }

  if (output?.provider !== 'slack') {
    throw new Error(`Notification provider mismatch: ${output?.provider}`);
  }

  const serialized = JSON.stringify({ input: notificationStep.inputJson, output, execution });

  if (!serialized.includes(leadId)) {
    throw new Error('Notification persisted data did not include the validation lead id.');
  }
}
