import type { MessageTrace } from '../shared';
import type { WorkspaceScope } from '../workspace';

export const EVENT_CONTRACT_VERSION = 1 as const;

export interface EventEnvelope<Name extends string, Payload> extends MessageTrace {
  readonly contractVersion: typeof EVENT_CONTRACT_VERSION;
  readonly eventId: string;
  readonly eventName: Name;
  readonly occurredAt: string;
  readonly payload: Payload;
}

export interface WorkspaceEventEnvelope<Name extends string, Payload>
  extends EventEnvelope<Name, Payload>, WorkspaceScope {}
