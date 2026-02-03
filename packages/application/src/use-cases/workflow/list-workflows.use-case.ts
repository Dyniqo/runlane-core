import type { ListWorkflowsResponseDto } from '@runlane/contracts';
import type { WorkflowRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { buildListWorkflowsResponse } from './workflow-response';

export interface ListWorkflowsUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
}

export class ListWorkflowsUseCase implements UseCase<
  ListWorkflowsUseCaseInput,
  ListWorkflowsResponseDto
> {
  constructor(private readonly workflows: WorkflowRepositoryPort) {}

  async execute(input: ListWorkflowsUseCaseInput): Promise<ListWorkflowsResponseDto> {
    const workflows = await this.workflows.listForWorkspace(input.scope.workspaceId);

    return buildListWorkflowsResponse(workflows);
  }
}
