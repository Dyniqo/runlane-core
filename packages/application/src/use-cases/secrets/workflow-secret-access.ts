import type { StoredWorkflowRecord, WorkflowRepositoryPort } from '../../ports';
import { workflowNotFound } from '../workflow';

export async function ensureWorkflowExistsForSecretAccess(
  workflows: WorkflowRepositoryPort,
  input: {
    readonly workspaceId: string;
    readonly workflowId: string;
  },
): Promise<StoredWorkflowRecord> {
  const workflow = await workflows.findByWorkspaceId({
    workspaceId: input.workspaceId,
    id: input.workflowId,
  });

  if (!workflow) {
    throw workflowNotFound();
  }

  return workflow;
}
