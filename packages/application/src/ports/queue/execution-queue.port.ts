import type { ExecutionJobName } from '@runlane/contracts';

export const EXECUTION_QUEUE = Symbol('EXECUTION_QUEUE');

export interface EnqueueExecutionJobInput {
  readonly workspaceId: string;
  readonly executionId: string;
  readonly workflowId: string;
  readonly isDemo: boolean;
  readonly demoSessionId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly enqueuedAt: Date;
}

export interface EnqueuedExecutionJobRecord {
  readonly queueName: string;
  readonly jobId: string;
  readonly jobName: ExecutionJobName;
  readonly workspaceId: string;
  readonly executionId: string;
  readonly workflowId: string;
  readonly enqueuedAt: Date;
}

export interface ExecutionQueueHealthRecord {
  readonly queueName: string;
  readonly waiting: number;
  readonly delayed: number;
  readonly active: number;
  readonly failed: number;
  readonly completed: number;
  readonly paused: number;
}

export interface ExecutionQueuePort {
  enqueueExecution(input: EnqueueExecutionJobInput): Promise<EnqueuedExecutionJobRecord>;
  getHealth(): Promise<ExecutionQueueHealthRecord>;
}
