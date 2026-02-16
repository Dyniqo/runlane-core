import type { AutomationBridgeContractResponseDto } from '@runlane/contracts';
import {
  automationWorkflowNotAcceptingRequests,
  automationWorkflowNotFound,
  normalizeWorkflowPublicId,
} from '@runlane/domain';
import type { ApiKeyScopeRecord } from '../access';
import type { WorkflowRepositoryPort } from '../../ports';
import type { UseCase } from '../use-case';
import { buildAutomationBridgeContract } from './automation-response';

export interface GetAutomationWorkflowContractUseCaseInput {
  readonly scope: ApiKeyScopeRecord;
  readonly workflowPublicId: string;
}

export class GetAutomationWorkflowContractUseCase implements UseCase<
  GetAutomationWorkflowContractUseCaseInput,
  AutomationBridgeContractResponseDto
> {
  constructor(private readonly workflows: WorkflowRepositoryPort) {}

  async execute(
    input: GetAutomationWorkflowContractUseCaseInput,
  ): Promise<AutomationBridgeContractResponseDto> {
    const workflow = await this.workflows.findPublishedByPublicId(
      normalizeWorkflowPublicId(input.workflowPublicId),
    );

    if (!workflow || workflow.workspaceId !== input.scope.workspaceId) {
      throw automationWorkflowNotFound();
    }

    if (workflow.triggerType !== 'automation') {
      throw automationWorkflowNotAcceptingRequests();
    }

    return {
      contract: buildAutomationBridgeContract(workflow),
    };
  }
}
