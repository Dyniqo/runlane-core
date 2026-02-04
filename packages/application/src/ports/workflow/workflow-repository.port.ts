import type { JsonValue } from '@runlane/contracts';
import type { WorkflowStatus } from '@runlane/domain';

export const WORKFLOW_REPOSITORY = Symbol('WORKFLOW_REPOSITORY');

export interface StoredWorkflowRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly status: WorkflowStatus;
  readonly version: number;
  readonly triggerType: string;
  readonly definition: JsonValue;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateWorkflowInput {
  readonly workspaceId: string;
  readonly name: string;
  readonly triggerType: string;
  readonly definition: JsonValue;
}

export interface UpdateWorkflowInput {
  readonly workspaceId: string;
  readonly id: string;
  readonly name?: string;
  readonly triggerType?: string;
  readonly definition?: JsonValue;
  readonly incrementVersion?: boolean;
}

export interface PublishWorkflowInput {
  readonly workspaceId: string;
  readonly id: string;
  readonly publishedAt: Date;
}

export interface WorkflowRepositoryPort {
  createForWorkspace(input: CreateWorkflowInput): Promise<StoredWorkflowRecord>;
  listForWorkspace(workspaceId: string): Promise<readonly StoredWorkflowRecord[]>;
  findByWorkspaceId(
    input: Readonly<{ workspaceId: string; id: string }>,
  ): Promise<StoredWorkflowRecord | null>;
  updateForWorkspace(input: UpdateWorkflowInput): Promise<StoredWorkflowRecord | null>;
  publishForWorkspace(input: PublishWorkflowInput): Promise<StoredWorkflowRecord | null>;
}
