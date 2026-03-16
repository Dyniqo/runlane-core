import type { ListConnectorCredentialsResponseDto } from '@runlane/contracts';
import { assertWorkspaceRole } from '@runlane/domain';
import type {
  ConnectorCredentialRepositoryPort,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildListConnectorCredentialsResponse } from './secret-response';
import { ensureWorkflowExistsForSecretAccess } from './workflow-secret-access';

export interface ListConnectorCredentialsUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly workflowId: string;
}

export class ListConnectorCredentialsUseCase implements UseCase<
  ListConnectorCredentialsUseCaseInput,
  ListConnectorCredentialsResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly credentials: ConnectorCredentialRepositoryPort,
  ) {}

  async execute(
    input: ListConnectorCredentialsUseCaseInput,
  ): Promise<ListConnectorCredentialsResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    await ensureWorkflowExistsForSecretAccess(this.workflows, {
      workspaceId: input.scope.workspaceId,
      workflowId: input.workflowId,
    });
    const credentials = await this.credentials.listForWorkflow({
      workspaceId: input.scope.workspaceId,
      workflowId: input.workflowId,
    });

    return buildListConnectorCredentialsResponse(credentials);
  }
}
