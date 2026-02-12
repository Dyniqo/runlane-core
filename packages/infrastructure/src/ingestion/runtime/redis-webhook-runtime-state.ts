import { Inject, Injectable } from '@nestjs/common';
import type {
  ReserveWebhookIdempotencyInput,
  ReserveWebhookReplayInput,
  WebhookRuntimeStatePort,
} from '@runlane/application';
import {
  workspaceIdempotencyRedisKey,
  workspaceReplayProtectionRedisKey,
} from '@runlane/contracts';
import { RedisService } from '../../redis';

@Injectable()
export class RedisWebhookRuntimeState implements WebhookRuntimeStatePort {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  reserveReplay(input: ReserveWebhookReplayInput): Promise<boolean> {
    return this.redis.setIfAbsent(
      workspaceReplayProtectionRedisKey(input.workspaceId, input.replayKeyHash),
      '1',
      input.ttlSeconds,
    );
  }

  reserveIdempotencyKey(input: ReserveWebhookIdempotencyInput): Promise<boolean> {
    return this.redis.setIfAbsent(
      workspaceIdempotencyRedisKey(input.workspaceId, input.idempotencyKeyHash),
      '1',
      input.ttlSeconds,
    );
  }
}
