import { PrismaClient } from '@prisma/client';

const [, , email, workflowId, executionId, secretValue, credentialValue] = process.argv;

if (!email || !workflowId || !executionId || !secretValue || !credentialValue) {
  throw new Error(
    'Usage: node scripts/validate-secrets-database.mjs <email> <workflowId> <executionId> <secretValue> <credentialValue>',
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
    throw new Error('Secret validation workspace was not found.');
  }

  const secret = await prisma.workflowSecret.findFirst({
    where: {
      workspaceId,
      workflowId,
      key: 'routing_token',
    },
    select: {
      encryptedValue: true,
    },
  });

  if (!secret) {
    throw new Error('Workflow secret was not persisted.');
  }

  if (secret.encryptedValue.includes(secretValue) || !secret.encryptedValue.startsWith('v1:')) {
    throw new Error('Workflow secret was not encrypted with the expected payload format.');
  }

  const credential = await prisma.connectorCredential.findFirst({
    where: {
      workspaceId,
      workflowId,
      name: 'primary_crm',
    },
    select: {
      type: true,
      encryptedValue: true,
      metadataJson: true,
    },
  });

  if (!credential) {
    throw new Error('Connector credential was not persisted.');
  }

  if (credential.type !== 'bearer_token') {
    throw new Error('Connector credential type was not persisted correctly.');
  }

  if (
    credential.encryptedValue.includes(credentialValue) ||
    !credential.encryptedValue.startsWith('v1:')
  ) {
    throw new Error('Connector credential was not encrypted with the expected payload format.');
  }

  if (
    credential.metadataJson?.provider !== 'crm' ||
    credential.metadataJson?.headerName !== 'Authorization'
  ) {
    throw new Error('Connector credential metadata was not persisted correctly.');
  }

  const execution = await prisma.execution.findFirst({
    where: { id: executionId, workspaceId, status: 'SUCCEEDED' },
    select: { id: true },
  });

  if (!execution) {
    throw new Error('Secret-backed execution did not succeed.');
  }

  const step = await prisma.executionStep.findFirst({
    where: { workspaceId, executionId, stepKey: 'classify' },
    select: { inputJson: true, outputJson: true },
  });

  if (!step) {
    throw new Error('Secret-backed execution step was not persisted.');
  }

  const serializedStep = JSON.stringify(step.inputJson);

  if (serializedStep.includes(secretValue) || serializedStep.includes(credentialValue)) {
    throw new Error('Persisted execution step input leaked a raw secret value.');
  }

  if (serializedStep.includes('{{ secrets.routing_token }}')) {
    throw new Error('Persisted execution step input leaked an unresolved secret expression.');
  }

  const secretReference = step.inputJson?.step?.secretReferences?.[0];

  if (secretReference?.key !== 'routing_token' || secretReference?.path !== '$.secretToken') {
    throw new Error(
      'Persisted execution step input did not include masked secret reference metadata.',
    );
  }

  if (step.inputJson?.step?.config?.secretToken?.__runlaneSecretRef !== 'routing_token') {
    throw new Error(
      'Persisted execution step input did not include the safe secret reference marker.',
    );
  }
} finally {
  await prisma.$disconnect();
}
