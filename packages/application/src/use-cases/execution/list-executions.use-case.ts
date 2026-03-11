import type { ListExecutionsResponseDto } from '@runlane/contracts';
import type {
  ExecutionRepositoryPort,
  StoredWorkflowRecord,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildListExecutionsResponse } from './execution-response';

const DEFAULT_EXECUTION_LIMIT = 50;
const MAX_EXECUTION_LIMIT = 100;

export interface ListExecutionsUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly cursor: string | null;
  readonly limit: number | null;
}

export class ListExecutionsUseCase implements UseCase<
  ListExecutionsUseCaseInput,
  ListExecutionsResponseDto
> {
  constructor(
    private readonly executions: ExecutionRepositoryPort,
    private readonly workflows: WorkflowRepositoryPort,
  ) {}

  async execute(input: ListExecutionsUseCaseInput): Promise<ListExecutionsResponseDto> {
    const limit = normalizeLimit(input.limit);
    const records = await this.executions.listByWorkspace({
      workspaceId: input.scope.workspaceId,
      cursor: input.cursor,
      limit: limit + 1,
    });
    const workflowSummaries = await this.resolveWorkflowSummaries(input.scope.workspaceId, records);

    return buildListExecutionsResponse({
      executions: records,
      workflows: workflowSummaries,
      limit,
    });
  }

  private async resolveWorkflowSummaries(
    workspaceId: string,
    executions: readonly { readonly workflowId: string }[],
  ): Promise<ReadonlyMap<string, Pick<StoredWorkflowRecord, 'publicId' | 'version'>>> {
    const uniqueWorkflowIds = [...new Set(executions.map((execution) => execution.workflowId))];
    const entries = await Promise.all(
      uniqueWorkflowIds.map(async (workflowId) => {
        const workflow = await this.workflows.findByWorkspaceId({ workspaceId, id: workflowId });
        return workflow ? ([workflowId, workflow] as const) : null;
      }),
    );

    return new Map(
      entries.filter((entry): entry is readonly [string, StoredWorkflowRecord] => entry !== null),
    );
  }
}

function normalizeLimit(limit: number | null): number {
  if (limit === null) {
    return DEFAULT_EXECUTION_LIMIT;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    return DEFAULT_EXECUTION_LIMIT;
  }

  return Math.min(limit, MAX_EXECUTION_LIMIT);
}
