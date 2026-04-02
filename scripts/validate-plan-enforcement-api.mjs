import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const apiBaseUrl = readString(process.env.RUNLANE_API_BASE_URL, 'http://localhost:4600').replace(
  /\/+$/,
  '',
);
const webhookSigningSecret = readString(
  process.env.WEBHOOK_SIGNING_SECRET,
  'runlane_local_webhook_signing_secret_change_me_64_bytes_minimum_value',
);
const timestamp = Date.now();
const password = 'RunlanePassword123!';

await main();

async function main() {
  const conditionDefinition = {
    schemaVersion: 1,
    trigger: { type: 'automation', config: {} },
    entryStepKey: 'accept',
    steps: [{ key: 'accept', name: 'Accept', type: 'condition', config: {} }],
  };

  const workflowUser = await createValidationUser('workflows');
  await createWorkflow(workflowUser, `Plan workflow one ${timestamp}`, conditionDefinition);
  await createWorkflow(workflowUser, `Plan workflow two ${timestamp}`, conditionDefinition);
  await expectJsonFailure({
    method: 'POST',
    path: '/v1/workflows',
    headers: workflowUser.headers,
    expectedCode: 'PLAN_LIMIT_EXCEEDED',
    body: {
      name: `Plan workflow three ${timestamp}`,
      triggerType: 'automation',
      definition: conditionDefinition,
    },
  });

  const executionUser = await createValidationUser('executions');
  const executionWorkflow = await createPublishedWorkflow(
    executionUser,
    `Plan execution workflow ${timestamp}`,
    conditionDefinition,
  );
  runNodeScript([
    'scripts/validate-plan-enforcement-database.mjs',
    'seed-usage',
    executionUser.email,
    'execution',
    '100',
    `execution-${timestamp}`,
  ]);
  await expectJsonFailure({
    method: 'POST',
    path: `/v1/automation/execute/${executionWorkflow.workflow.publicId}`,
    headers: {
      'X-Runlane-Api-Key': executionUser.apiKey,
      'X-Runlane-Source': 'plan_execution_limit',
    },
    expectedCode: 'PLAN_LIMIT_EXCEEDED',
    body: { payload: { leadId: `execution-${timestamp}` } },
  });

  const webhookUser = await createValidationUser('webhooks');
  const webhookDefinition = {
    schemaVersion: 1,
    trigger: { type: 'webhook', config: {} },
    entryStepKey: 'accept',
    steps: [{ key: 'accept', name: 'Accept', type: 'condition', config: {} }],
  };
  const webhookWorkflow = await createWorkflow(
    webhookUser,
    `Plan webhook workflow ${timestamp}`,
    webhookDefinition,
    'webhook',
  );
  const webhookPublished = await requestJson({
    method: 'POST',
    path: `/v1/workflows/${webhookWorkflow.workflow.id}/publish`,
    headers: webhookUser.headers,
  });
  runNodeScript([
    'scripts/validate-plan-enforcement-database.mjs',
    'seed-usage',
    webhookUser.email,
    'webhook_request',
    '100',
    `webhook-${timestamp}`,
  ]);
  const webhookPayload = { leadId: `webhook-${timestamp}`, source: 'plan_validation' };
  await expectJsonFailure({
    method: 'POST',
    path: `/v1/hooks/${webhookPublished.workflow.publicId}`,
    headers: {
      'X-Runlane-Source': 'plan_validation',
      'X-Runlane-Signature': signWebhookPayload(webhookPayload),
    },
    expectedCode: 'PLAN_LIMIT_EXCEEDED',
    body: webhookPayload,
  });

  const aiUser = await createValidationUser('ai');
  const aiDefinition = {
    schemaVersion: 1,
    trigger: { type: 'automation', config: {} },
    entryStepKey: 'route',
    steps: [
      {
        key: 'route',
        name: 'Route with AI',
        type: 'ai_decision',
        timeoutMs: 30000,
        config: {
          messages: [
            { role: 'system', content: 'Return JSON.' },
            { role: 'user', content: 'Return qualified branch.' },
          ],
          schema: {
            type: 'object',
            required: ['branch'],
            additionalProperties: false,
            properties: { branch: { type: 'string', enum: ['qualified'] } },
          },
          branchPath: 'branch',
        },
      },
    ],
  };
  const aiWorkflow = await createPublishedWorkflow(
    aiUser,
    `Plan AI workflow ${timestamp}`,
    aiDefinition,
  );
  runNodeScript([
    'scripts/validate-plan-enforcement-database.mjs',
    'seed-usage',
    aiUser.email,
    'ai_call',
    '10',
    `ai-${timestamp}`,
  ]);
  const aiAccepted = await invokeAutomationWorkflow(aiWorkflow, aiUser, 'plan_ai_limit');
  waitForExecution(aiAccepted.execution);
  runNodeScript([
    'scripts/validate-plan-enforcement-database.mjs',
    'assert-execution-failed',
    aiUser.email,
    aiAccepted.execution.id,
    'PLAN_LIMIT_EXCEEDED',
  ]);

  const httpUser = await createValidationUser('http');
  const httpDefinition = {
    schemaVersion: 1,
    trigger: { type: 'automation', config: {} },
    entryStepKey: 'send_http',
    steps: [
      {
        key: 'send_http',
        name: 'Send HTTP',
        type: 'http',
        timeoutMs: 5000,
        config: {
          request: {
            method: 'POST',
            url: 'https://example.com',
            bodyType: 'json',
            body: { source: 'plan_validation' },
          },
          auth: { mode: 'none' },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 2048,
          },
        },
      },
    ],
  };
  const httpWorkflow = await createPublishedWorkflow(
    httpUser,
    `Plan HTTP workflow ${timestamp}`,
    httpDefinition,
  );
  runNodeScript([
    'scripts/validate-plan-enforcement-database.mjs',
    'seed-usage',
    httpUser.email,
    'http_call',
    '100',
    `http-${timestamp}`,
  ]);
  const httpAccepted = await invokeAutomationWorkflow(httpWorkflow, httpUser, 'plan_http_limit');
  waitForExecution(httpAccepted.execution);
  runNodeScript([
    'scripts/validate-plan-enforcement-database.mjs',
    'assert-execution-failed',
    httpUser.email,
    httpAccepted.execution.id,
    'PLAN_LIMIT_EXCEEDED',
  ]);

  process.stdout.write(
    `Plan enforcement validation completed for runlane.plan.${timestamp}@example.com\n`,
  );
}

async function createValidationUser(label) {
  const email = `runlane.plan.${label}.${timestamp}@example.com`;

  await requestJson({
    method: 'POST',
    path: '/v1/auth/register',
    body: {
      email,
      password,
      name: `Runlane Plan ${label}`,
    },
  });

  const login = await requestJson({
    method: 'POST',
    path: '/v1/auth/login',
    body: { email, password },
  });

  const headers = { Authorization: `Bearer ${login.tokens.accessToken}` };
  const apiKey = await requestJson({
    method: 'POST',
    path: '/v1/api-keys',
    headers,
    body: { name: `Plan validation key ${label} ${timestamp}` },
  });

  return { email, headers, apiKey: apiKey.token };
}

function createWorkflow(user, name, definition, triggerType = 'automation') {
  return requestJson({
    method: 'POST',
    path: '/v1/workflows',
    headers: user.headers,
    body: { name, triggerType, definition },
  });
}

async function createPublishedWorkflow(user, name, definition) {
  const workflow = await createWorkflow(user, name, definition);
  return requestJson({
    method: 'POST',
    path: `/v1/workflows/${workflow.workflow.id}/publish`,
    headers: user.headers,
  });
}

function invokeAutomationWorkflow(workflow, user, source) {
  return requestJson({
    method: 'POST',
    path: `/v1/automation/execute/${workflow.workflow.publicId}`,
    headers: {
      'X-Runlane-Api-Key': user.apiKey,
      'X-Runlane-Source': source,
      'X-Runlane-Idempotency-Key': `${source}-${timestamp}`,
    },
    body: { payload: { leadId: `${source}-${timestamp}` } },
  });
}

async function requestJson(input) {
  const response = await request(input);

  if (!response.ok) {
    throw new Error(
      `Expected ${input.method} ${input.path} to succeed, got ${response.status}. Body=${response.text}`,
    );
  }

  return parseJsonResponse(response, input);
}

async function expectJsonFailure(input) {
  const response = await request(input);

  if (response.ok) {
    throw new Error(
      `Expected ${input.method} ${input.path} to fail with ${input.expectedCode}, but it succeeded.`,
    );
  }

  const payload = parseJsonResponse(response, input);
  const actualCode = readErrorCode(payload);

  if (actualCode !== input.expectedCode) {
    throw new Error(
      `Expected ${input.method} ${input.path} to fail with ${input.expectedCode}, got ${actualCode ?? 'missing error code'}. Status=${response.status} Body=${response.text}`,
    );
  }

  return payload;
}

async function request(input) {
  const headers = {
    Accept: 'application/json',
    ...(input.headers ?? {}),
  };
  const options = {
    method: input.method,
    headers,
  };

  if (input.body !== undefined) {
    options.body = JSON.stringify(input.body);
    headers['Content-Type'] = 'application/json';
  }

  let response;

  try {
    response = await fetch(`${apiBaseUrl}${input.path}`, options);
  } catch (error) {
    throw new Error(
      `HTTP request failed for ${input.method} ${input.path}: ${formatError(error)}`,
      { cause: error },
    );
  }

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
    contentType: response.headers.get('content-type') ?? '',
  };
}

function parseJsonResponse(response, input) {
  if (!response.text.trim()) {
    throw new Error(
      `Expected JSON body for ${input.method} ${input.path}, got empty body. Status=${response.status}`,
    );
  }

  try {
    return JSON.parse(response.text);
  } catch (error) {
    throw new Error(
      `Expected JSON body for ${input.method} ${input.path}, got invalid JSON. Status=${response.status} Body=${response.text}`,
      { cause: error },
    );
  }
}

function readErrorCode(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload.code === 'string') {
    return payload.code;
  }

  if (typeof payload.errorCode === 'string') {
    return payload.errorCode;
  }

  if (payload.error && typeof payload.error === 'object') {
    if (typeof payload.error.code === 'string') {
      return payload.error.code;
    }

    if (typeof payload.error.errorCode === 'string') {
      return payload.error.errorCode;
    }
  }

  return null;
}

function signWebhookPayload(payload) {
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const payloadHash = createHash('sha256').update(stableStringify(payload)).digest('hex');
  const signedPayload = `${timestampSeconds}.${payloadHash}`;
  const digest = createHmac('sha256', webhookSigningSecret).update(signedPayload).digest('hex');

  return `t=${timestampSeconds},v1=${digest}`;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function waitForExecution(execution) {
  runNodeScript([
    'scripts/wait-for-execution-job.mjs',
    execution.workspaceId,
    execution.id,
    execution.workflowId,
  ]);
}

function runNodeScript(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Node script failed with exit code ${result.status}: node ${args.join(' ')}`);
  }
}

function readString(value, fallback) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

function formatError(error) {
  if (error instanceof Error) {
    const details = [];

    if ('code' in error && typeof error.code === 'string') {
      details.push(`code=${error.code}`);
    }

    if ('cause' in error && error.cause instanceof Error) {
      details.push(`cause=${error.cause.message}`);
    }

    return `${error.name}: ${error.message}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
  }

  return String(error);
}
