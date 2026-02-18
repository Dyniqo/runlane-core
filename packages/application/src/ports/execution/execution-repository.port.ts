import type { JsonObject } from '@runlane/contracts';
import type { ExecutionStatus, ExecutionTriggerType } from '@runlane/domain';

export const EXECUTION_REPOSITORY = Symbol('EXECUTION_REPOSITORY');

export interface StoredExecutionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly status: ExecutionStatus;
  readonly input: JsonObject;
  readonly output: JsonObject | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly attempts: number;
  readonly durationMs: number | null;
  readonly queuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateQueuedExecutionInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly input: JsonObject;
  readonly queuedAt: Date;
}

export interface FindExecutionByTriggerSourceInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly triggerType: ExecutionTriggerType;
  readonly sourceId: string;
}

export interface ExecutionRepositoryPort {
  createQueued(input: CreateQueuedExecutionInput): Promise<StoredExecutionRecord>;
  findLatestByTriggerSource(
    input: FindExecutionByTriggerSourceInput,
  ): Promise<StoredExecutionRecord | null>;
}
