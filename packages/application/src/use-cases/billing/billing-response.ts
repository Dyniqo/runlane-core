import type { StripeWebhookResponseDto } from '@runlane/contracts';
import type { BillingEventStatus } from '@runlane/domain';

export function buildStripeWebhookResponse(input: {
  readonly eventId: string;
  readonly eventType: string;
  readonly status: 'duplicate' | Extract<BillingEventStatus, 'ignored' | 'processed'>;
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
