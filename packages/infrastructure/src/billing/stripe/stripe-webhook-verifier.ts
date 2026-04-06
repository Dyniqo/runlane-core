import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import type {
  StripeBillingSubscriptionSnapshot,
  StripeWebhookVerifierPort,
  VerifiedStripeWebhookEvent,
  VerifyStripeWebhookInput,
} from '@runlane/application';
import type { JsonObject, JsonValue } from '@runlane/contracts';
import {
  assertStripeEventType,
  assertStripeObjectId,
  assertStripeWebhookPayload,
  assertStripeWebhookSignatureHeader,
  billingEventInvalid,
  normalizeBillingStatus,
  normalizeOptionalBillingPlan,
  stripeWebhookSignatureInvalid,
} from '@runlane/domain';

const SIGNATURE_TIMESTAMP_KEY = 't';
const SIGNATURE_DIGEST_KEY = 'v1';

@Injectable()
export class StripeWebhookVerifier implements StripeWebhookVerifierPort {
  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  verify(input: VerifyStripeWebhookInput): VerifiedStripeWebhookEvent {
    const payload = assertStripeWebhookPayload(input.rawPayload);
    const signatureHeader = assertStripeWebhookSignatureHeader(input.signatureHeader);
    const secret = this.config.stripeWebhookSecret;

    if (!secret) {
      throw billingEventInvalid('STRIPE_WEBHOOK_SECRET is required to receive Stripe webhooks');
    }

    verifyStripeSignature({
      payload,
      signatureHeader,
      secret,
      toleranceSeconds: this.config.stripeWebhookToleranceSeconds,
      now: input.receivedAt,
    });

    const event = parseJsonObject(payload);
    const eventId = assertStripeObjectId(readString(event.id), 'Stripe event id');
    const eventType = assertStripeEventType(readString(event.type));
    const createdAt = readStripeTimestamp(event.created) ?? input.receivedAt;

    return {
      id: eventId,
      type: eventType,
      createdAt,
      payload: event,
      subscription: readSubscriptionSnapshot(event),
    };
  }
}

function verifyStripeSignature(input: {
  readonly payload: string;
  readonly signatureHeader: string;
  readonly secret: string;
  readonly toleranceSeconds: number;
  readonly now: Date;
}): void {
  const components = parseStripeSignatureHeader(input.signatureHeader);
  const timestampValue = components.get(SIGNATURE_TIMESTAMP_KEY)?.[0];
  const signatures = components.get(SIGNATURE_DIGEST_KEY) ?? [];
  const timestamp = Number(timestampValue);

  if (
    !timestampValue ||
    !Number.isInteger(timestamp) ||
    timestamp <= 0 ||
    signatures.length === 0
  ) {
    throw stripeWebhookSignatureInvalid();
  }

  const receivedAtSeconds = Math.floor(input.now.getTime() / 1000);
  const ageSeconds = Math.abs(receivedAtSeconds - timestamp);

  if (ageSeconds > input.toleranceSeconds) {
    throw stripeWebhookSignatureInvalid();
  }

  const signedPayload = `${timestamp}.${input.payload}`;
  const expectedSignature = createHmac('sha256', input.secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  if (!signatures.some((signature) => secureCompareHex(signature, expectedSignature))) {
    throw stripeWebhookSignatureInvalid();
  }
}

function parseStripeSignatureHeader(value: string): Map<string, string[]> {
  const components = new Map<string, string[]>();

  for (const segment of value.split(',')) {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const componentValue = segment.slice(separatorIndex + 1).trim();

    if (!key || !componentValue) {
      continue;
    }

    const existingValues = components.get(key) ?? [];
    components.set(key, [...existingValues, componentValue]);
  }

  return components;
}

function secureCompareHex(received: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received)) {
    return false;
  }

  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function parseJsonObject(value: string): JsonObject {
  try {
    const parsedValue: unknown = JSON.parse(value);

    if (isJsonObject(parsedValue)) {
      return parsedValue;
    }
  } catch {
    throw billingEventInvalid('Stripe webhook payload must be valid JSON');
  }

  throw billingEventInvalid('Stripe webhook payload must be a JSON object');
}

function readSubscriptionSnapshot(event: JsonObject): StripeBillingSubscriptionSnapshot | null {
  const dataObject = readNestedObject(event, ['data', 'object']);

  if (!dataObject) {
    return null;
  }

  if (readString(dataObject.object) === 'invoice') {
    return readInvoiceSubscriptionSnapshot(dataObject);
  }

  if (readString(dataObject.object) !== 'subscription') {
    return null;
  }

  return readSubscriptionObjectSnapshot(dataObject);
}

function readInvoiceSubscriptionSnapshot(
  invoice: JsonObject,
): StripeBillingSubscriptionSnapshot | null {
  const stripeCustomerId = readOptionalString(invoice.customer);
  const stripeSubscriptionId = readOptionalString(invoice.subscription);

  if (!stripeCustomerId) {
    return null;
  }

  return {
    stripeCustomerId: assertStripeObjectId(stripeCustomerId, 'Stripe customer id'),
    stripeSubscriptionId: stripeSubscriptionId
      ? assertStripeObjectId(stripeSubscriptionId, 'Stripe subscription id')
      : null,
    billingStatus: 'past_due',
    plan: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };
}

function readSubscriptionObjectSnapshot(
  subscription: JsonObject,
): StripeBillingSubscriptionSnapshot | null {
  const stripeCustomerId = readOptionalString(subscription.customer);
  const stripeSubscriptionId = readOptionalString(subscription.id);

  if (!stripeCustomerId || !stripeSubscriptionId) {
    return null;
  }

  return {
    stripeCustomerId: assertStripeObjectId(stripeCustomerId, 'Stripe customer id'),
    stripeSubscriptionId: assertStripeObjectId(stripeSubscriptionId, 'Stripe subscription id'),
    billingStatus: normalizeBillingStatus(readString(subscription.status)),
    plan: readSubscriptionPlan(subscription),
    currentPeriodStart: readStripeTimestamp(subscription.current_period_start),
    currentPeriodEnd: readStripeTimestamp(subscription.current_period_end),
  };
}

function readSubscriptionPlan(
  subscription: JsonObject,
): ReturnType<typeof normalizeOptionalBillingPlan> {
  const metadataPlan = readOptionalString(
    readNestedObject(subscription, ['metadata'])?.runlane_plan,
  );

  if (metadataPlan) {
    return readOptionalPlanValue(metadataPlan);
  }

  const price = readFirstSubscriptionPrice(subscription);
  const priceMetadataPlan = readOptionalString(readNestedObject(price, ['metadata'])?.runlane_plan);

  if (priceMetadataPlan) {
    return readOptionalPlanValue(priceMetadataPlan);
  }

  return readOptionalPlanValue(readOptionalString(price?.lookup_key));
}

function readOptionalPlanValue(
  value: string | null,
): ReturnType<typeof normalizeOptionalBillingPlan> {
  try {
    return normalizeOptionalBillingPlan(value);
  } catch {
    return null;
  }
}

function readFirstSubscriptionPrice(subscription: JsonObject): JsonObject | null {
  const items = readNestedObject(subscription, ['items']);
  const data = Array.isArray(items?.data) ? items.data : [];
  const firstItem = data.find((item): item is JsonObject => isJsonObject(item));

  if (!firstItem) {
    return null;
  }

  return readNestedObject(firstItem, ['price']);
}

function readNestedObject(source: JsonObject | null, path: readonly string[]): JsonObject | null {
  let currentValue: JsonValue | undefined | JsonObject | null = source;

  for (const segment of path) {
    if (!isJsonObject(currentValue)) {
      return null;
    }

    currentValue = currentValue[segment];
  }

  return isJsonObject(currentValue) ? currentValue : null;
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    throw billingEventInvalid('Stripe event payload is missing a required string field');
  }

  return value;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStripeTimestamp(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return new Date(value * 1000);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
