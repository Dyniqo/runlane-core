import type { JsonObject } from '../shared';

export type ExecutionStatusDto =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'dead_letter'
  | 'cancelled';

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
