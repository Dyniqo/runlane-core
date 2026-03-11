import type { ExecutionResponseDto } from '@runlane/contracts';
import { executionNotFound, executionWorkflowNotFound } from '@runlane/domain';
import type {
  ExecutionRepositoryPort,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildExecutionResponse } from './execution-response';

export interface GetExecutionUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly executionId: string;
}

export class GetExecutionUseCase implements UseCase<
  GetExecutionUseCaseInput,
  ExecutionResponseDto
> {
  constructor(
    private readonly executions: ExecutionRepositoryPort,
    private readonly workflows: WorkflowRepositoryPort,
  ) {}

  async execute(input: GetExecutionUseCaseInput): Promise<ExecutionResponseDto> {
    const execution = await this.executions.findByWorkspaceAndId({
      workspaceId: input.scope.workspaceId,
      executionId: input.executionId,
    });

    if (!execution) {
      throw executionNotFound();
    }

    const workflow = await this.workflows.findByWorkspaceId({
      workspaceId: input.scope.workspaceId,
      id: execution.workflowId,
    });

    if (!workflow) {
      throw executionWorkflowNotFound();
    }

    return { execution: buildExecutionResponse(execution, workflow) };
  }
}
