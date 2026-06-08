import { PrismaClient } from './prisma-client-loader.mjs';

const [, , email, executionId, leadId, expectedSuccessValue] = process.argv;

if (!email || !executionId || !leadId || !expectedSuccessValue) {
  throw new Error(
    'Usage: node scripts/validate-ai-decision-database.mjs <email> <executionId> <leadId> <expectedSuccess>',
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
    throw new Error('AI decision validation workspace was not found.');
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
    throw new Error('AI decision execution was not found.');
  }

  const aiStep = await prisma.executionStep.findFirst({
    where: { workspaceId, executionId, stepKey: 'score_lead' },
    select: {
      status: true,
      inputJson: true,
      outputJson: true,
      errorCode: true,
      errorMessage: true,
    },
  });

  if (!aiStep) {
    throw new Error('AI decision step was not persisted.');
  }

  if (!expectedSuccess && execution.status !== 'SUCCEEDED') {
    assertMissingCredentialFailure(execution, aiStep);
    return;
  }

  await assertSuccessfulAiDecision(execution, aiStep, workspaceId);
}

function assertMissingCredentialFailure(execution, aiStep) {
  if (execution.status !== 'FAILED') {
    throw new Error(
      `AI decision execution should fail safely without credentials. status=${execution.status}`,
    );
  }

  if (execution.errorCode !== 'AI_PROVIDER_API_KEY_MISSING') {
    throw new Error(
      `AI decision missing-key error code mismatch: ${execution.errorCode} ${execution.errorMessage}`,
    );
  }

  if (execution.attempts !== 1) {
    throw new Error('AI decision missing-key execution should not be retried.');
  }

  if (aiStep.status !== 'FAILED' || aiStep.errorCode !== 'AI_PROVIDER_API_KEY_MISSING') {
    throw new Error('AI decision missing-key step did not preserve provider configuration error.');
  }
}

async function assertSuccessfulAiDecision(execution, aiStep, workspaceId) {
  if (execution.status !== 'SUCCEEDED') {
    throw new Error(
      `AI decision execution did not succeed. status=${execution.status}, attempts=${execution.attempts}, errorCode=${execution.errorCode}, errorMessage=${execution.errorMessage}, stepStatus=${aiStep.status}, stepErrorCode=${aiStep.errorCode}, stepErrorMessage=${aiStep.errorMessage}`,
    );
  }

  if (execution.errorCode !== null) {
    throw new Error('AI decision success execution persisted an unexpected error code.');
  }

  if (aiStep.status !== 'SUCCEEDED') {
    throw new Error('AI decision step did not succeed.');
  }

  const aiOutput = aiStep.outputJson;

  if (aiOutput?.branch !== 'qualified') {
    throw new Error(`AI decision branch mismatch: ${aiOutput?.branch}`);
  }

  if (aiOutput?.decision?.branch !== 'qualified') {
    throw new Error('AI decision structured output did not include the expected branch.');
  }

  if (typeof aiOutput?.decision?.score !== 'number') {
    throw new Error('AI decision structured output did not include a numeric score.');
  }

  if (typeof aiOutput?.decision?.reason !== 'string' || aiOutput.decision.reason.length < 3) {
    throw new Error('AI decision structured output did not include a reason.');
  }

  if (aiOutput?.provider?.model === undefined) {
    throw new Error('AI decision output did not include provider metadata.');
  }

  const acceptedStep = await prisma.executionStep.findFirst({
    where: { workspaceId, executionId, stepKey: 'accepted_route' },
    select: { status: true, outputJson: true },
  });

  if (!acceptedStep || acceptedStep.status !== 'SUCCEEDED') {
    throw new Error('AI decision did not route to the expected qualified branch.');
  }

  const nurtureStep = await prisma.executionStep.findFirst({
    where: { workspaceId, executionId, stepKey: 'nurture_route' },
    select: { status: true },
  });

  if (nurtureStep) {
    throw new Error('AI decision executed an unexpected branch step.');
  }

  const serialized = JSON.stringify({
    input: aiStep.inputJson,
    output: aiStep.outputJson,
    execution: execution.outputJson,
  });

  if (!serialized.includes(leadId)) {
    throw new Error('AI decision persisted data did not include the validation lead id.');
  }
}
