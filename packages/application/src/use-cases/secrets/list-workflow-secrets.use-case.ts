import type { ListWorkflowSecretsResponseDto } from '@runlane/contracts';
import { assertWorkspaceRole } from '@runlane/domain';
import type {
  WorkflowRepositoryPort,
  WorkflowSecretRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildListWorkflowSecretsResponse } from './secret-response';
import { ensureWorkflowExistsForSecretAccess } from './workflow-secret-access';

export interface ListWorkflowSecretsUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly workflowId: string;
}

export class ListWorkflowSecretsUseCase implements UseCase<
  ListWorkflowSecretsUseCaseInput,
  ListWorkflowSecretsResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly secrets: WorkflowSecretRepositoryPort,
  ) {}

  async execute(input: ListWorkflowSecretsUseCaseInput): Promise<ListWorkflowSecretsResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    await ensureWorkflowExistsForSecretAccess(this.workflows, {
      workspaceId: input.scope.workspaceId,
      workflowId: input.workflowId,
    });
    const secrets = await this.secrets.listForWorkflow({
      workspaceId: input.scope.workspaceId,
      workflowId: input.workflowId,
    });

    return buildListWorkflowSecretsResponse(secrets);
  }
}
