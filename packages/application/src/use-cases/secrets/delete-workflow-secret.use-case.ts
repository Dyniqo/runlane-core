import type { DeleteWorkflowSecretResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  normalizeWorkflowSecretKey,
  workflowSecretNotFound,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkflowSecretRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { ensureWorkflowExistsForSecretAccess } from './workflow-secret-access';

export interface DeleteWorkflowSecretUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly workflowId: string;
  readonly key: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class DeleteWorkflowSecretUseCase implements UseCase<
  DeleteWorkflowSecretUseCaseInput,
  DeleteWorkflowSecretResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly secrets: WorkflowSecretRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: DeleteWorkflowSecretUseCaseInput): Promise<DeleteWorkflowSecretResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const key = normalizeWorkflowSecretKey(input.key);

    return this.transactionBoundary.execute(async () => {
      const workflow = await ensureWorkflowExistsForSecretAccess(this.workflows, {
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
      });
      const deleted = await this.secrets.deleteByKey({
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
        key,
      });

      if (!deleted) {
        throw workflowSecretNotFound();
      }

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'workflow.secret_deleted',
        entityType: 'workflow_secret',
        entityId: deleted.id,
        metadata: {
          workflowId: workflow.id,
          workflowPublicId: workflow.publicId,
          key,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return { deleted: true };
    });
  }
}
