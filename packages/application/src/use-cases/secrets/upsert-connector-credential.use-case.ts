import type { ConnectorCredentialResponseDto, JsonObject } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  normalizeConnectorCredentialName,
  normalizeConnectorCredentialType,
  readConnectorCredentialMetadata,
  readSecretValue,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  ConnectorCredentialRepositoryPort,
  SecretCipherPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildConnectorCredentialAssociatedData } from './secret-aad';
import { buildConnectorCredentialResponse } from './secret-response';
import { ensureWorkflowExistsForSecretAccess } from './workflow-secret-access';

export interface UpsertConnectorCredentialUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly workflowId: string;
  readonly name: string;
  readonly type: string;
  readonly value: unknown;
  readonly metadata: unknown;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class UpsertConnectorCredentialUseCase implements UseCase<
  UpsertConnectorCredentialUseCaseInput,
  ConnectorCredentialResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly credentials: ConnectorCredentialRepositoryPort,
    private readonly cipher: SecretCipherPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: UpsertConnectorCredentialUseCaseInput): Promise<ConnectorCredentialResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const name = normalizeConnectorCredentialName(input.name);
    const type = normalizeConnectorCredentialType(input.type);
    const value = readSecretValue(input.value, 'Connector credential value is invalid');
    const metadata = readConnectorCredentialMetadata(input.metadata) as JsonObject;

    return this.transactionBoundary.execute(async () => {
      const workflow = await ensureWorkflowExistsForSecretAccess(this.workflows, {
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
      });
      const encryptedValue = this.cipher.encrypt({
        plaintext: value,
        associatedData: buildConnectorCredentialAssociatedData({
          workspaceId: input.scope.workspaceId,
          workflowId: input.workflowId,
          name,
          type,
        }),
      });
      const credential = await this.credentials.upsert({
        workspaceId: input.scope.workspaceId,
        workflowId: input.workflowId,
        name,
        type,
        encryptedValue,
        metadata,
      });

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'connector.credential_upserted',
        entityType: 'connector_credential',
        entityId: credential.id,
        metadata: {
          workflowId: workflow.id,
          workflowPublicId: workflow.publicId,
          name,
          type,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildConnectorCredentialResponse(credential);
    });
  }
}
