import type {
  ExecutionDto,
  ExecutionStepDto,
  ListExecutionsResponseDto,
  WorkflowDto,
} from '@runlane/contracts';
import type { StoredExecutionRecord, StoredExecutionStepRecord } from '../../ports';

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

export function buildListExecutionsResponse(input: {
  readonly executions: readonly StoredExecutionRecord[];
  readonly workflows: ReadonlyMap<string, Pick<WorkflowDto, 'publicId' | 'version'>>;
  readonly limit: number;
}): ListExecutionsResponseDto {
  const items = input.executions
    .slice(0, input.limit)
    .map((execution) =>
      buildExecutionResponse(
        execution,
        resolveWorkflowSummary(input.workflows, execution.workflowId),
      ),
    );
  const hasMore = input.executions.length > input.limit;
  const lastItem = items[items.length - 1] ?? null;

  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem ? lastItem.createdAt : null,
  };
}

export function buildExecutionStepResponse(step: StoredExecutionStepRecord): ExecutionStepDto {
  return {
    id: step.id,
    workspaceId: step.workspaceId,
    executionId: step.executionId,
    stepKey: step.stepKey,
    type: step.type,
    status: step.status,
    input: step.input,
    output: step.output,
    errorCode: step.errorCode,
    errorMessage: step.errorMessage,
    durationMs: step.durationMs,
    startedAt: step.startedAt.toISOString(),
    finishedAt: step.finishedAt?.toISOString() ?? null,
    createdAt: step.createdAt.toISOString(),
  };
}

function resolveWorkflowSummary(
  workflows: ReadonlyMap<string, Pick<WorkflowDto, 'publicId' | 'version'>>,
  workflowId: string,
): Pick<WorkflowDto, 'publicId' | 'version'> {
  const workflow = workflows.get(workflowId);

  if (!workflow) {
    return { publicId: 'wf_unknown', version: 0 };
  }

  return workflow;
}
