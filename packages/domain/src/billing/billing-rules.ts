import { DomainError } from '../shared';
import { normalizeWorkspacePlan, type WorkspacePlan } from '../workspace';

export const BILLING_PROVIDERS = ['stripe'] as const;
export const BILLING_EVENT_STATUSES = ['received', 'processed', 'ignored', 'failed'] as const;
export const BILLING_STATUSES = [
  'none',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
] as const;

export type BillingProvider = (typeof BILLING_PROVIDERS)[number];
export type BillingEventStatus = (typeof BILLING_EVENT_STATUSES)[number];
export type BillingStatus = (typeof BILLING_STATUSES)[number];

const STRIPE_OBJECT_ID_PATTERN = /^[A-Za-z0-9_]{3,255}$/;
const STRIPE_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
] as const;

export type StripeBillingEventType = (typeof STRIPE_EVENT_TYPES)[number] | string;

export interface BillingSubscriptionState {
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string | null;
  readonly billingStatus: BillingStatus;
  readonly plan: WorkspacePlan | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
}

export function normalizeBillingProvider(value: string): BillingProvider {
  if (value === 'stripe') {
    return value;
  }

  throw billingEventInvalid('Billing provider is not supported');
}

export function normalizeBillingEventStatus(value: string): BillingEventStatus {
  if (BILLING_EVENT_STATUSES.some((status) => status === value)) {
    return value as BillingEventStatus;
  }

  throw billingEventInvalid('Billing event status is not supported');
}

export function normalizeBillingStatus(value: string): BillingStatus {
  const normalizedValue = value.trim().toLowerCase();

  if (BILLING_STATUSES.some((status) => status === normalizedValue)) {
    return normalizedValue as BillingStatus;
  }

  return 'none';
}

export function normalizeOptionalBillingPlan(
  value: string | null | undefined,
): WorkspacePlan | null {
  if (!value) {
    return null;
  }

  return normalizeWorkspacePlan(value);
}

export function assertStripeObjectId(value: string, name: string): string {
  const normalizedValue = value.trim();

  if (!STRIPE_OBJECT_ID_PATTERN.test(normalizedValue)) {
    throw billingEventInvalid(`${name} is invalid`);
  }

  return normalizedValue;
}

export function assertStripeEventType(value: string): string {
  const normalizedValue = value.trim();

  if (
    normalizedValue.length === 0 ||
    normalizedValue.length > 120 ||
    !normalizedValue.includes('.')
  ) {
    throw billingEventInvalid('Stripe event type is invalid');
  }

  return normalizedValue;
}

export function assertStripeWebhookSignatureHeader(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > 4096) {
    throw stripeWebhookSignatureInvalid();
  }

  return normalizedValue;
}

export function assertStripeWebhookPayload(value: string): string {
  if (value.length === 0 || value.length > 1024 * 1024) {
    throw billingEventInvalid('Stripe webhook payload size is invalid');
  }

  return value;
}

export function isHandledStripeBillingEventType(value: string): boolean {
  return STRIPE_EVENT_TYPES.some((eventType) => eventType === value);
}

export function billingEventAlreadyProcessed(): DomainError {
  return new DomainError({
    code: 'BILLING_EVENT_ALREADY_PROCESSED',
    category: 'conflict',
    message: 'Billing event was already processed',
  });
}

export function billingEventInvalid(message: string): DomainError {
  return new DomainError({
    code: 'BILLING_EVENT_INVALID',
    category: 'validation',
    message,
  });
}

export function stripeWebhookSignatureInvalid(): DomainError {
  return new DomainError({
    code: 'STRIPE_WEBHOOK_SIGNATURE_INVALID',
    category: 'authentication',
    message: 'Stripe webhook signature is invalid',
  });
}

export function billingWorkspaceNotFound(stripeCustomerId: string): DomainError {
  return new DomainError({
    code: 'BILLING_WORKSPACE_NOT_FOUND',
    category: 'not_found',
    message: 'Billing workspace was not found',
    details: { stripeCustomerId },
  });
}
