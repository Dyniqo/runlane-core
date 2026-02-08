import type { JsonValue } from '../shared';
import type { WorkflowDefinition } from '../workflow-schema';

export type WorkflowStatusDto = 'draft' | 'published' | 'archived';
export type WorkflowTestExecutionModeDto = 'contract';

export interface WorkflowDto {
  readonly id: string;
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly status: WorkflowStatusDto;
  readonly version: number;
  readonly triggerType: string;
  readonly definition: WorkflowDefinition | JsonValue;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateWorkflowRequestDto {
  readonly name: string;
  readonly triggerType?: string;
  readonly definition?: WorkflowDefinition;
}

export interface UpdateWorkflowRequestDto {
  readonly name?: string;
  readonly triggerType?: string;
  readonly definition?: WorkflowDefinition;
}

export interface WorkflowTestRequestDto {
  readonly payload?: JsonValue;
  readonly source?: string;
  readonly idempotencyKey?: string;
}

export interface WorkflowTestExecutionContractDto {
  readonly mode: WorkflowTestExecutionModeDto;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workspaceId: string;
  readonly workflowVersion: number;
  readonly triggerType: string;
  readonly workflowStatus: WorkflowStatusDto;
  readonly entryStepKey: string;
  readonly stepCount: number;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly payload: JsonValue;
  readonly acceptedAt: string;
}

export interface WorkflowResponseDto {
  readonly workflow: WorkflowDto;
}

export interface WorkflowTestResponseDto {
  readonly contract: WorkflowTestExecutionContractDto;
}

export interface ListWorkflowsResponseDto {
  readonly items: readonly WorkflowDto[];
}
