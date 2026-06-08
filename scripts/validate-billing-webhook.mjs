import { createHmac } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from './prisma-client-loader.mjs';

const ENVIRONMENT_FILES = ['.env.local', '.env'];
const API_BASE_URL = process.env.RUNLANE_API_BASE_URL ?? 'http://localhost:4600/v1';
const LOCAL_STRIPE_SECRET = 'runlane_local_stripe_webhook_secret_change_me_64_bytes_minimum_value';

for (const file of ENVIRONMENT_FILES) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

const prisma = new PrismaClient();

try {
  await main();
} finally {
  await prisma.$disconnect();
}

async function main() {
  const stamp = String(Date.now());
  const email = `runlane.billing.${stamp}@example.com`;
  const password = `RunlaneBilling${stamp}!`;
  const stripeCustomerId = `cus_runlane_${stamp}`;
  const stripeSubscriptionId = `sub_runlane_${stamp}`;
  const stripeEventId = `evt_runlane_${stamp}`;
  const currentPeriodStart = Math.floor(Date.now() / 1000) - 60;
  const currentPeriodEnd = currentPeriodStart + 2592000;
  const registration = await postJson('/auth/register', {
    email,
    password,
    name: 'Runlane Billing Validation',
  });
  const workspaceId = registration.workspace.id;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId },
  });

  const event = {
    id: stripeEventId,
    object: 'event',
    type: 'customer.subscription.updated',
    created: currentPeriodStart,
    data: {
      object: {
        id: stripeSubscriptionId,
        object: 'subscription',
        customer: stripeCustomerId,
        status: 'active',
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        metadata: {
          runlane_plan: 'starter',
        },
        items: {
          data: [
            {
              price: {
                id: 'price_runlane_starter',
                lookup_key: 'starter',
                metadata: {
                  runlane_plan: 'starter',
                },
              },
            },
          ],
        },
      },
    },
  };
  const rawPayload = JSON.stringify(event);
  const firstResponse = await postStripeWebhook(rawPayload);

  assertEqual(
    firstResponse.received,
    true,
    'Stripe webhook response did not mark the event as received.',
  );
  assertEqual(
    firstResponse.eventId,
    stripeEventId,
    'Stripe webhook response has an unexpected event id.',
  );
  assertEqual(
    firstResponse.status,
    'processed',
    'Stripe webhook response did not process the event.',
  );
  assertEqual(
    firstResponse.workspaceId,
    workspaceId,
    'Stripe webhook response resolved the wrong workspace.',
  );

  const duplicateResponse = await postStripeWebhook(rawPayload);
  assertEqual(duplicateResponse.status, 'duplicate', 'Duplicate Stripe event was not idempotent.');

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      billingStatus: true,
      billingCurrentPeriodStart: true,
      billingCurrentPeriodEnd: true,
    },
  });

  if (!workspace) {
    throw new Error('Billing workspace was not found after webhook processing.');
  }

  assertEqual(
    workspace.plan,
    'STARTER',
    'Workspace plan was not synchronized from Stripe metadata.',
  );
  assertEqual(
    workspace.stripeCustomerId,
    stripeCustomerId,
    'Stripe customer id was not synchronized.',
  );
  assertEqual(
    workspace.stripeSubscriptionId,
    stripeSubscriptionId,
    'Stripe subscription id was not synchronized.',
  );
  assertEqual(workspace.billingStatus, 'ACTIVE', 'Billing status was not synchronized.');

  if (!workspace.billingCurrentPeriodStart || !workspace.billingCurrentPeriodEnd) {
    throw new Error('Billing period was not synchronized.');
  }

  const events = await prisma.billingEvent.findMany({
    where: { provider: 'STRIPE', providerEventId: stripeEventId },
    select: { status: true, workspaceId: true, processedAt: true },
  });

  assertEqual(
    events.length,
    1,
    'Stripe event idempotency did not persist exactly one billing event.',
  );
  assertEqual(events[0].status, 'PROCESSED', 'Billing event status was not processed.');
  assertEqual(events[0].workspaceId, workspaceId, 'Billing event workspace id is incorrect.');

  if (!events[0].processedAt) {
    throw new Error('Billing event processed timestamp is missing.');
  }

  console.log(`Billing webhook validation completed for ${email}`);
}

async function postStripeWebhook(rawPayload) {
  const response = await fetch(`${API_BASE_URL}/billing/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': createStripeSignature(rawPayload),
    },
    body: rawPayload,
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Stripe webhook request failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Request ${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

function createStripeSignature(rawPayload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = process.env.STRIPE_WEBHOOK_SECRET || LOCAL_STRIPE_SECRET;
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawPayload}`).digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}.`);
  }
}
