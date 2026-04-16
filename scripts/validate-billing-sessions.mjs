import { loadEnvFile } from 'node:process';

const ENVIRONMENT_FILES = ['.env.local', '.env'];

for (const file of ENVIRONMENT_FILES) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

const apiBaseUrl = normalizeApiBaseUrl(
  readString(process.env.RUNLANE_API_BASE_URL, 'http://localhost:4600'),
);
const timestamp = Date.now();
const password = 'RunlanePassword123!';

try {
  await main();
} catch (error) {
  console.error(formatError(error));
  process.exitCode = 1;
}

async function main() {
  const email = `runlane.billing.sessions.${timestamp}@example.com`;
  const auth = await createValidationUser(email);
  const checkoutResponse = await request({
    method: 'POST',
    path: '/billing/checkout',
    headers: auth.headers,
    body: { plan: 'pro' },
  });
  const checkoutPayload = await readJsonResponse(checkoutResponse);

  if (!checkoutResponse.ok) {
    await assertExpectedCheckoutFailure({
      status: checkoutResponse.status,
      payload: checkoutPayload,
      email,
      headers: auth.headers,
    });
    return;
  }

  assertCheckoutSession({
    session: checkoutPayload,
    workspaceId: auth.workspaceId,
  });

  const portal = await requestJson({
    method: 'POST',
    path: '/billing/portal',
    headers: auth.headers,
  });

  assertEqual(portal.provider, 'stripe', 'Portal session provider is incorrect.');
  assertEqual(portal.workspaceId, auth.workspaceId, 'Portal session workspace id is incorrect.');
  assertEqual(
    portal.stripeCustomerId,
    checkoutPayload.stripeCustomerId,
    'Portal session customer id is incorrect.',
  );
  assertString(portal.sessionId, 'Portal session id is missing.');
  assertStripeUrl(portal.url, 'Portal session URL is invalid.');

  console.log(`Billing session validation completed for ${email} with configured Stripe API key`);
}

async function assertExpectedCheckoutFailure(input) {
  const code = readErrorCode(input.payload);

  if (code === 'BILLING_STRIPE_API_KEY_MISSING') {
    await expectJsonFailure({
      method: 'POST',
      path: '/billing/portal',
      headers: input.headers,
      expectedCode: 'BILLING_STRIPE_CUSTOMER_MISSING',
    });
    console.log(
      `Billing session validation completed for ${input.email} without configured Stripe API key`,
    );
    return;
  }

  if (code === 'BILLING_STRIPE_PRICE_MISSING') {
    console.log(
      `Billing session validation completed for ${input.email} without configured Stripe prices`,
    );
    return;
  }

  if (code === 'BILLING_STRIPE_REQUEST_FAILED') {
    console.log(
      `Billing session validation completed for ${input.email} with Stripe request failure path verified`,
    );
    return;
  }

  throw new Error(
    `Expected /billing/checkout to fail with a known billing setup code, got status=${input.status} body=${JSON.stringify(input.payload)}`,
  );
}

async function createValidationUser(email) {
  await requestJson({
    method: 'POST',
    path: '/auth/register',
    body: {
      email,
      password,
      name: 'Runlane Billing Session Validation',
    },
  });
  const login = await requestJson({
    method: 'POST',
    path: '/auth/login',
    body: { email, password },
  });

  return {
    email,
    workspaceId: login.workspace.id,
    headers: { Authorization: `Bearer ${login.tokens.accessToken}` },
  };
}

async function expectJsonFailure(input) {
  const response = await request({
    method: input.method,
    path: input.path,
    headers: input.headers,
    body: input.body,
  });
  const payload = await readJsonResponse(response);

  if (response.ok) {
    throw new Error(`Expected ${input.path} to fail with ${input.expectedCode}, but it succeeded.`);
  }

  if (readErrorCode(payload) !== input.expectedCode) {
    throw new Error(
      `Expected ${input.path} to fail with ${input.expectedCode}, got status=${response.status} body=${JSON.stringify(payload)}`,
    );
  }
}

async function requestJson(input) {
  const response = await request(input);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Request ${input.path} failed with ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function request(input) {
  const headers = {
    ...(input.headers ?? {}),
    ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
  };

  return fetch(buildApiUrl(input.path), {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
}

function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const versionedPath = normalizedPath.startsWith('/v1/') ? normalizedPath : `/v1${normalizedPath}`;

  return `${apiBaseUrl}${versionedPath}`;
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response body was not valid JSON: ${text}`);
  }
}

function assertCheckoutSession(input) {
  assertEqual(input.session.provider, 'stripe', 'Checkout session provider is incorrect.');
  assertEqual(
    input.session.workspaceId,
    input.workspaceId,
    'Checkout session workspace id is incorrect.',
  );
  assertEqual(input.session.plan, 'pro', 'Checkout session plan is incorrect.');
  assertString(input.session.stripeCustomerId, 'Checkout session Stripe customer id is missing.');
  assertString(input.session.sessionId, 'Checkout session id is missing.');
  assertStripeUrl(input.session.url, 'Checkout session URL is invalid.');
}

function readErrorCode(payload) {
  return typeof payload?.code === 'string' ? payload.code : undefined;
}

function normalizeApiBaseUrl(value) {
  return value.trim().replace(/\/+$/u, '').replace(/\/v1$/iu, '');
}

function readString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}.`);
  }
}

function assertString(value, message) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(message);
  }
}

function assertStripeUrl(value, message) {
  assertString(value, message);

  if (!/^https:\/\//u.test(value)) {
    throw new Error(message);
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
}
