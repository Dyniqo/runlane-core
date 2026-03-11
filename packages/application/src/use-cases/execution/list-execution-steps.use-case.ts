import type { ExecutionStepsResponseDto } from '@runlane/contracts';
import { executionNotFound } from '@runlane/domain';
import type {
  ExecutionRepositoryPort,
  ExecutionStepRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildExecutionStepResponse } from './execution-response';

export interface ListExecutionStepsUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly executionId: string;
}

export class ListExecutionStepsUseCase implements UseCase<
  ListExecutionStepsUseCaseInput,
  ExecutionStepsResponseDto
> {
  constructor(
    private readonly executions: ExecutionRepositoryPort,
    private readonly steps: ExecutionStepRepositoryPort,
  ) {}

  async execute(input: ListExecutionStepsUseCaseInput): Promise<ExecutionStepsResponseDto> {
    const execution = await this.executions.findByWorkspaceAndId({
      workspaceId: input.scope.workspaceId,
      executionId: input.executionId,
    });

    if (!execution) {
      throw executionNotFound();
    }

    const steps = await this.steps.listByExecution({
      workspaceId: input.scope.workspaceId,
      executionId: input.executionId,
    });

    return { items: steps.map(buildExecutionStepResponse) };
  }
}
