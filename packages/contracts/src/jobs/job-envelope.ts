import type { MessageTrace } from '../shared';

export const JOB_CONTRACT_VERSION = 1 as const;

export interface JobEnvelope<Name extends string, Payload> extends MessageTrace {
  readonly contractVersion: typeof JOB_CONTRACT_VERSION;
  readonly jobId: string;
  readonly jobName: Name;
  readonly enqueuedAt: string;
  readonly payload: Payload;
}
