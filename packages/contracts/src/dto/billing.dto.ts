export interface StripeWebhookResponseDto {
  readonly received: true;
  readonly eventId: string;
  readonly eventType: string;
  readonly status: 'processed' | 'ignored' | 'duplicate';
  readonly workspaceId: string | null;
}
