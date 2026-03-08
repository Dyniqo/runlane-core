import type { JsonObject } from '@runlane/contracts';
import type { ExecutionStepStatus, WorkflowStepType } from '@runlane/domain';

export const EXECUTION_STEP_REPOSITORY = Symbol('EXECUTION_STEP_REPOSITORY');

export interface StoredExecutionStepRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly executionId: string;
  readonly stepKey: string;
  readonly type: WorkflowStepType;
  readonly status: ExecutionStepStatus;
  readonly input: JsonObject;
  readonly output: JsonObject | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly durationMs: number | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateRunningExecutionStepInput {
  readonly workspaceId: string;
  readonly executionId: string;
  readonly stepKey: string;
  readonly type: WorkflowStepType;
  readonly input: JsonObject;
  readonly startedAt: Date;
}

export interface MarkExecutionStepSucceededInput {
  readonly workspaceId: string;
  readonly executionId: string;
  readonly stepKey: string;
  readonly output: JsonObject;
  readonly finishedAt: Date;
  readonly durationMs: number;
}

export interface MarkExecutionStepFailedInput {
  readonly workspaceId: string;
  readonly executionId: string;
  readonly stepKey: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly finishedAt: Date;
  readonly durationMs: number;
}

export interface ListExecutionStepsInput {
  readonly workspaceId: string;
  readonly executionId: string;
}

export interface ExecutionStepRepositoryPort {
  createRunning(input: CreateRunningExecutionStepInput): Promise<StoredExecutionStepRecord>;
  markSucceeded(input: MarkExecutionStepSucceededInput): Promise<StoredExecutionStepRecord | null>;
  markFailed(input: MarkExecutionStepFailedInput): Promise<StoredExecutionStepRecord | null>;
  listByExecution(input: ListExecutionStepsInput): Promise<readonly StoredExecutionStepRecord[]>;
}
