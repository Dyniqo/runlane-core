import type { JsonValue } from '@runlane/contracts';
import type { BillingStatus } from '@runlane/domain';
import type { WorkspacePlan } from '@runlane/domain';

export const STRIPE_WEBHOOK_VERIFIER = Symbol('STRIPE_WEBHOOK_VERIFIER');

export interface StripeBillingSubscriptionSnapshot {
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string | null;
  readonly billingStatus: BillingStatus;
  readonly plan: WorkspacePlan | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
}

export interface VerifiedStripeWebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly createdAt: Date;
  readonly payload: JsonValue;
  readonly subscription: StripeBillingSubscriptionSnapshot | null;
}

export interface VerifyStripeWebhookInput {
  readonly rawPayload: string;
  readonly signatureHeader: string;
  readonly receivedAt: Date;
}

export interface StripeWebhookVerifierPort {
  verify(input: VerifyStripeWebhookInput): VerifiedStripeWebhookEvent;
}
