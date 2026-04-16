import type { BillingCheckoutPlan } from '@runlane/domain';

export const STRIPE_BILLING_GATEWAY = Symbol('STRIPE_BILLING_GATEWAY');

export interface CreateStripeCustomerInput {
  readonly workspaceId: string;
  readonly workspaceName: string;
}

export interface StripeCustomerRecord {
  readonly id: string;
}

export interface CreateStripeCheckoutSessionInput {
  readonly workspaceId: string;
  readonly userId: string;
  readonly stripeCustomerId: string;
  readonly plan: BillingCheckoutPlan;
}

export interface StripeCheckoutSessionRecord {
  readonly id: string;
  readonly url: string;
}

export interface CreateStripePortalSessionInput {
  readonly workspaceId: string;
  readonly stripeCustomerId: string;
}

export interface StripePortalSessionRecord {
  readonly id: string;
  readonly url: string;
}

export interface StripeBillingGatewayPort {
  assertCheckoutSessionConfigured(plan: BillingCheckoutPlan): void;
  createCustomer(input: CreateStripeCustomerInput): Promise<StripeCustomerRecord>;
  createCheckoutSession(
    input: CreateStripeCheckoutSessionInput,
  ): Promise<StripeCheckoutSessionRecord>;
  createPortalSession(input: CreateStripePortalSessionInput): Promise<StripePortalSessionRecord>;
}
