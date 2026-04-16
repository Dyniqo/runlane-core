import type {
  BillingCheckoutResponseDto,
  BillingPortalResponseDto,
  StripeWebhookResponseDto,
} from '@runlane/contracts';
import type { BillingCheckoutPlan } from '@runlane/domain';

export function buildStripeWebhookResponse(input: {
  readonly eventId: string;
  readonly eventType: string;
  readonly status: 'processed' | 'ignored' | 'duplicate';
  readonly workspaceId: string | null;
}): StripeWebhookResponseDto {
  return {
    received: true,
    eventId: input.eventId,
    eventType: input.eventType,
    status: input.status,
    workspaceId: input.workspaceId,
  };
}

export function buildBillingCheckoutResponse(input: {
  readonly workspaceId: string;
  readonly plan: BillingCheckoutPlan;
  readonly stripeCustomerId: string;
  readonly sessionId: string;
  readonly url: string;
}): BillingCheckoutResponseDto {
  return {
    provider: 'stripe',
    workspaceId: input.workspaceId,
    plan: input.plan,
    stripeCustomerId: input.stripeCustomerId,
    sessionId: input.sessionId,
    url: input.url,
  };
}

export function buildBillingPortalResponse(input: {
  readonly workspaceId: string;
  readonly stripeCustomerId: string;
  readonly sessionId: string;
  readonly url: string;
}): BillingPortalResponseDto {
  return {
    provider: 'stripe',
    workspaceId: input.workspaceId,
    stripeCustomerId: input.stripeCustomerId,
    sessionId: input.sessionId,
    url: input.url,
  };
}
