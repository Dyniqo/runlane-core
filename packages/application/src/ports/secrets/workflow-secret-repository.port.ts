export const WORKFLOW_SECRET_REPOSITORY = Symbol('WORKFLOW_SECRET_REPOSITORY');

export interface StoredWorkflowSecretRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly key: string;
  readonly encryptedValue: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertWorkflowSecretInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly key: string;
  readonly encryptedValue: string;
}

export interface DeleteWorkflowSecretInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly key: string;
}

export interface FindWorkflowSecretInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly key: string;
}

export interface FindWorkflowSecretsByKeysInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly keys: readonly string[];
}

export interface WorkflowSecretRepositoryPort {
  upsert(input: UpsertWorkflowSecretInput): Promise<StoredWorkflowSecretRecord>;
  listForWorkflow(input: {
    readonly workspaceId: string;
    readonly workflowId: string;
  }): Promise<readonly StoredWorkflowSecretRecord[]>;
  findByKey(input: FindWorkflowSecretInput): Promise<StoredWorkflowSecretRecord | null>;
  findManyByKeys(
    input: FindWorkflowSecretsByKeysInput,
  ): Promise<readonly StoredWorkflowSecretRecord[]>;
  deleteByKey(input: DeleteWorkflowSecretInput): Promise<StoredWorkflowSecretRecord | null>;
}
