export const WEBHOOK_RUNTIME_STATE = Symbol('WEBHOOK_RUNTIME_STATE');

export interface ReserveWebhookReplayInput {
  readonly workspaceId: string;
  readonly replayKeyHash: string;
  readonly ttlSeconds: number;
}

export interface ReserveWebhookIdempotencyInput {
  readonly workspaceId: string;
  readonly idempotencyKeyHash: string;
  readonly ttlSeconds: number;
}

export interface WebhookRuntimeStatePort {
  reserveReplay(input: ReserveWebhookReplayInput): Promise<boolean>;
  reserveIdempotencyKey(input: ReserveWebhookIdempotencyInput): Promise<boolean>;
}
