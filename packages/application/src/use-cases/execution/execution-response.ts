import type { ExecutionDto, WorkflowDto } from '@runlane/contracts';
import type { StoredExecutionRecord } from '../../ports';

export function buildExecutionResponse(
  execution: StoredExecutionRecord,
  workflow: Pick<WorkflowDto, 'publicId' | 'version'>,
): ExecutionDto {
  return {
    id: execution.id,
    workspaceId: execution.workspaceId,
    workflowId: execution.workflowId,
    workflowPublicId: workflow.publicId,
    workflowVersion: workflow.version,
    status: execution.status,
    attempts: execution.attempts,
    input: execution.input,
    output: execution.output,
    errorCode: execution.errorCode,
    errorMessage: execution.errorMessage,
    durationMs: execution.durationMs,
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    createdAt: execution.createdAt.toISOString(),
  };
}
