import type { WorkspacePlanDto } from './usage.dto';

export type BillingCheckoutPlanDto = Exclude<WorkspacePlanDto, 'free'>;

export interface BillingCheckoutRequestDto {
  readonly plan: BillingCheckoutPlanDto;
}

export interface BillingCheckoutResponseDto {
  readonly provider: 'stripe';
  readonly workspaceId: string;
  readonly plan: BillingCheckoutPlanDto;
  readonly stripeCustomerId: string;
  readonly sessionId: string;
  readonly url: string;
}

export interface BillingPortalResponseDto {
  readonly provider: 'stripe';
  readonly workspaceId: string;
  readonly stripeCustomerId: string;
  readonly sessionId: string;
  readonly url: string;
}

export interface StripeWebhookResponseDto {
  readonly received: true;
  readonly eventId: string;
  readonly eventType: string;
  readonly status: 'processed' | 'ignored' | 'duplicate';
  readonly workspaceId: string | null;
}
