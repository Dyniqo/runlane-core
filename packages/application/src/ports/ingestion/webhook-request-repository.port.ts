import type { WebhookRequestStatus } from '@runlane/domain';

export const WEBHOOK_REQUEST_REPOSITORY = Symbol('WEBHOOK_REQUEST_REPOSITORY');

export interface StoredWebhookRequestRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly signature: string | null;
  readonly idempotencyKey: string | null;
  readonly payloadHash: string;
  readonly source: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly status: WebhookRequestStatus;
  readonly createdAt: Date;
}

export interface CreateWebhookRequestInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly signature: string | null;
  readonly idempotencyKey: string | null;
  readonly payloadHash: string;
  readonly source: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly status: WebhookRequestStatus;
}

export interface FindWebhookRequestByIdempotencyKeyInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly idempotencyKey: string;
}

export interface WebhookRequestRepositoryPort {
  create(input: CreateWebhookRequestInput): Promise<StoredWebhookRequestRecord>;
  findLatestByIdempotencyKey(
    input: FindWebhookRequestByIdempotencyKeyInput,
  ): Promise<StoredWebhookRequestRecord | null>;
}
