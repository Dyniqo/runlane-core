import type { CursorPageDto } from './cursor-page.dto';
import type { JsonObject } from '../shared';

export type ExecutionStatusDto =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'dead_letter'
  | 'cancelled';

export type ExecutionStepStatusDto = 'running' | 'succeeded' | 'failed';

export interface ExecutionStepDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly executionId: string;
  readonly stepKey: string;
  readonly type: string;
  readonly status: ExecutionStepStatusDto;
  readonly input: JsonObject;
  readonly output: JsonObject | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly durationMs: number | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly createdAt: string;
}

export interface ExecutionDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly status: ExecutionStatusDto;
  readonly attempts: number;
  readonly input: JsonObject;
  readonly output: JsonObject | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly durationMs: number | null;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
}

export interface ExecutionResponseDto {
  readonly execution: ExecutionDto;
}

export type ListExecutionsResponseDto = CursorPageDto<ExecutionDto>;

export interface ExecutionStepsResponseDto {
  readonly items: readonly ExecutionStepDto[];
}
