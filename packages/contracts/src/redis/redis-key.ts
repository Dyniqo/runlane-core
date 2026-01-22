const REDIS_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type WorkspaceRateLimitRedisKey = `ws:${string}:rate:${string}:${string}`;
export type WorkspaceIdempotencyRedisKey = `ws:${string}:idem:${string}`;
export type WorkspaceReplayProtectionRedisKey = `ws:${string}:replay:${string}`;
export type DemoSessionRedisKey = `demo:${string}`;
export type WorkerHeartbeatRedisKey = `worker:${string}:heartbeat`;

export function workspaceRateLimitRedisKey(
  workspaceId: string,
  scope: string,
  subjectKey: string,
): WorkspaceRateLimitRedisKey {
  return joinRedisKey('ws', workspaceId, 'rate', scope, subjectKey) as WorkspaceRateLimitRedisKey;
}

export function workspaceIdempotencyRedisKey(
  workspaceId: string,
  keyHash: string,
): WorkspaceIdempotencyRedisKey {
  return joinRedisKey('ws', workspaceId, 'idem', keyHash) as WorkspaceIdempotencyRedisKey;
}

export function workspaceReplayProtectionRedisKey(
  workspaceId: string,
  keyHash: string,
): WorkspaceReplayProtectionRedisKey {
  return joinRedisKey('ws', workspaceId, 'replay', keyHash) as WorkspaceReplayProtectionRedisKey;
}

export function demoSessionRedisKey(sessionKeyHash: string): DemoSessionRedisKey {
  return joinRedisKey('demo', sessionKeyHash) as DemoSessionRedisKey;
}

export function workerHeartbeatRedisKey(workerId: string): WorkerHeartbeatRedisKey {
  return joinRedisKey('worker', workerId, 'heartbeat') as WorkerHeartbeatRedisKey;
}

function joinRedisKey(...segments: readonly string[]): string {
  return segments.map((segment) => assertRedisKeySegment(segment)).join(':');
}

function assertRedisKeySegment(segment: string): string {
  if (!REDIS_KEY_SEGMENT_PATTERN.test(segment)) {
    throw new TypeError(
      'Redis key segments must use safe characters and contain at most 128 bytes',
    );
  }

  return segment;
}
