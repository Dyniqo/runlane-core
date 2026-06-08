import prismaClientPackage from '@prisma/client';

const { PrismaClient } = prismaClientPackage;

const [, , email, executionId, leadId] = process.argv;

if (!email || !executionId || !leadId) {
  throw new Error(
    'Usage: node scripts/validate-template-resolver-database.mjs <email> <executionId> <leadId>',
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
    throw new Error('Template resolver validation workspace was not found.');
  }

  const execution = await prisma.execution.findFirst({
    where: { id: executionId, workspaceId, status: 'SUCCEEDED' },
    select: { id: true, outputJson: true },
  });

  if (!execution) {
    throw new Error('Template resolver execution did not succeed.');
  }

  if (execution.outputJson?.stepCount !== 2) {
    throw new Error('Template resolver execution step count mismatch.');
  }

  const steps = await prisma.executionStep.findMany({
    where: { workspaceId, executionId },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: {
      stepKey: true,
      status: true,
      inputJson: true,
      outputJson: true,
    },
  });

  if (steps.length !== 2) {
    throw new Error('Template resolver did not persist the expected steps.');
  }

  const [classify, notify] = steps;

  if (classify.stepKey !== 'classify' || classify.status !== 'SUCCEEDED') {
    throw new Error('Template resolver first step was not persisted correctly.');
  }

  const classifyConfig = classify.inputJson?.step?.config;

  if (
    classifyConfig?.branch !== 'premium' ||
    classifyConfig?.pass !== true ||
    classifyConfig?.leadMessage !== `Lead ${leadId} assigned to premium` ||
    classify.outputJson?.branch !== 'premium'
  ) {
    throw new Error('Template resolver did not resolve payload expressions correctly.');
  }

  if (
    classifyConfig?.secretToken?.__runlaneSecretRef !== 'routing_token' ||
    classifyConfig?.secretToken?.source !== 'workflow_secret' ||
    classifyConfig?.secretToken?.required !== true
  ) {
    throw new Error('Template resolver did not map secret references safely.');
  }

  const secretReferences = classify.inputJson?.step?.secretReferences;

  if (
    !Array.isArray(secretReferences) ||
    secretReferences.length !== 1 ||
    secretReferences[0]?.key !== 'routing_token' ||
    secretReferences[0]?.path !== '$.secretToken'
  ) {
    throw new Error('Template resolver did not persist secret reference metadata.');
  }

  const serializedClassifyInput = JSON.stringify(classify.inputJson);

  if (serializedClassifyInput.includes('{{ secrets.routing_token }}')) {
    throw new Error('Template resolver leaked unresolved secret placeholders into step input.');
  }

  if (notify.stepKey !== 'notify' || notify.status !== 'SUCCEEDED') {
    throw new Error('Template resolver second step was not persisted correctly.');
  }

  const notifyConfig = notify.inputJson?.step?.config;

  if (
    notifyConfig?.branch !== 'premium' ||
    notifyConfig?.summary !== 'Route premium for linus@example.com' ||
    notify.outputJson?.branch !== 'premium'
  ) {
    throw new Error(
      'Template resolver did not resolve previous step output expressions correctly.',
    );
  }
} finally {
  await prisma.$disconnect();
}
