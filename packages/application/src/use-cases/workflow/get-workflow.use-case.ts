import type { WorkflowResponseDto } from '@runlane/contracts';
import type { WorkflowRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { workflowNotFound } from './workflow-errors';
import { buildWorkflowResponse } from './workflow-response';

export interface GetWorkflowUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly id: string;
}

export class GetWorkflowUseCase implements UseCase<GetWorkflowUseCaseInput, WorkflowResponseDto> {
  constructor(private readonly workflows: WorkflowRepositoryPort) {}

  async execute(input: GetWorkflowUseCaseInput): Promise<WorkflowResponseDto> {
    const workflow = await this.workflows.findByWorkspaceId({
      workspaceId: input.scope.workspaceId,
      id: input.id,
    });

    if (!workflow) {
      throw workflowNotFound();
    }

    return buildWorkflowResponse(workflow);
  }
}
