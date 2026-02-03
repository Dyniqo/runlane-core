import type { JsonValue } from '../shared';

export type WorkflowStatusDto = 'draft' | 'published' | 'archived';

export interface WorkflowDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly status: WorkflowStatusDto;
  readonly version: number;
  readonly triggerType: string;
  readonly definition: JsonValue;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateWorkflowRequestDto {
  readonly name: string;
  readonly triggerType?: string;
  readonly definition?: JsonValue;
}

export interface UpdateWorkflowRequestDto {
  readonly name?: string;
  readonly triggerType?: string;
  readonly definition?: JsonValue;
}

export interface WorkflowResponseDto {
  readonly workflow: WorkflowDto;
}

export interface ListWorkflowsResponseDto {
  readonly items: readonly WorkflowDto[];
}
