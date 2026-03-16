import type { DeleteConnectorCredentialResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  connectorCredentialNotFound,
  normalizeConnectorCredentialName,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  ConnectorCredentialRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { ensureWorkflowExistsForSecretAccess } from './workflow-secret-access';

export interface DeleteConnectorCredentialUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly workflowId: string;
  readonly name: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class DeleteConnectorCredentialUseCase implements UseCase<
  DeleteConnectorCredentialUseCaseInput,
  DeleteConnectorCredentialResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly credentials: ConnectorCredentialRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(
    input: DeleteConnectorCredentialUseCaseInput,
  ): Promise<DeleteConnectorCredentialResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const name = normalizeConnectorCredentialName(input.name);

    return this.transactionBoundary.execute(async () => {
      const workflow = await ensureWorkflowExistsForSecretAccess(this.workflows, {
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
      });
      const deleted = await this.credentials.deleteByName({
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
        name,
      });

      if (!deleted) {
        throw connectorCredentialNotFound();
      }

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'connector.credential_deleted',
        entityType: 'connector_credential',
        entityId: deleted.id,
        metadata: {
          workflowId: workflow.id,
          workflowPublicId: workflow.publicId,
          name,
          type: deleted.type,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return { deleted: true };
    });
  }
}
