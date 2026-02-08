import type {
  ListWorkflowsResponseDto,
  WorkflowDto,
  WorkflowResponseDto,
} from '@runlane/contracts';
import type { StoredWorkflowRecord } from '../../ports';

export function buildWorkflowResponse(workflow: StoredWorkflowRecord): WorkflowResponseDto {
  return { workflow: mapWorkflow(workflow) };
}

export function buildListWorkflowsResponse(
  workflows: readonly StoredWorkflowRecord[],
): ListWorkflowsResponseDto {
  return { items: workflows.map((workflow) => mapWorkflow(workflow)) };
}

function mapWorkflow(workflow: StoredWorkflowRecord): WorkflowDto {
  return {
    id: workflow.id,
    publicId: workflow.publicId,
    workspaceId: workflow.workspaceId,
    name: workflow.name,
    status: workflow.status,
    version: workflow.version,
    triggerType: workflow.triggerType,
    definition: workflow.definition,
    publishedAt: workflow.publishedAt ? workflow.publishedAt.toISOString() : null,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
  };
}
