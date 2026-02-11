export type WebhookRequestStatusDto = 'accepted' | 'rejected';

export interface WebhookRequestDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly status: WebhookRequestStatusDto;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly payloadHash: string;
  readonly receivedAt: string;
}

export interface PublicWebhookResponseDto {
  readonly webhookRequest: WebhookRequestDto;
}
