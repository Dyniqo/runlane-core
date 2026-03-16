import type { WorkflowSecretResponseDto } from '@runlane/contracts';
import { assertWorkspaceRole, normalizeWorkflowSecretKey, readSecretValue } from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  SecretCipherPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkflowSecretRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildWorkflowSecretAssociatedData } from './secret-aad';
import { buildWorkflowSecretResponse } from './secret-response';
import { ensureWorkflowExistsForSecretAccess } from './workflow-secret-access';

export interface UpsertWorkflowSecretUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly workflowId: string;
  readonly key: string;
  readonly value: unknown;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class UpsertWorkflowSecretUseCase implements UseCase<
  UpsertWorkflowSecretUseCaseInput,
  WorkflowSecretResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly secrets: WorkflowSecretRepositoryPort,
    private readonly cipher: SecretCipherPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: UpsertWorkflowSecretUseCaseInput): Promise<WorkflowSecretResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const key = normalizeWorkflowSecretKey(input.key);
    const value = readSecretValue(input.value, 'Workflow secret value is invalid');

    return this.transactionBoundary.execute(async () => {
      const workflow = await ensureWorkflowExistsForSecretAccess(this.workflows, {
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
      });
      const encryptedValue = this.cipher.encrypt({
        plaintext: value,
        associatedData: buildWorkflowSecretAssociatedData({
          workspaceId: input.scope.workspaceId,
          workflowId: input.workflowId,
          key,
        }),
      });
      const secret = await this.secrets.upsert({
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
        key,
        encryptedValue,
      });

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'workflow.secret_upserted',
        entityType: 'workflow_secret',
        entityId: secret.id,
        metadata: {
          workflowId: workflow.id,
          workflowPublicId: workflow.publicId,
          key,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildWorkflowSecretResponse(secret);
    });
  }
}
