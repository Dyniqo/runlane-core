import type { RevokeApiKeyResponseDto } from '@runlane/contracts';
import { assertWorkspaceRole } from '@runlane/domain';
import type {
  ApiKeyRepositoryPort,
  AuditLogRepositoryPort,
  TransactionBoundary,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { rejectApiKeyAccess } from './api-key-errors';

export interface RevokeApiKeyUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly id: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class RevokeApiKeyUseCase implements UseCase<
  RevokeApiKeyUseCaseInput,
  RevokeApiKeyResponseDto
> {
  constructor(
    private readonly apiKeys: ApiKeyRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: RevokeApiKeyUseCaseInput): Promise<RevokeApiKeyResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);

    return this.transactionBoundary.execute(async () => {
      const revokedApiKey = await this.apiKeys.revokeForWorkspace({
        workspaceId: input.scope.workspaceId,
        id: input.id,
        revokedAt: new Date(),
      });

      if (!revokedApiKey) {
        rejectApiKeyAccess();
      }

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'access.api_key_revoked',
        entityType: 'api_key',
        entityId: revokedApiKey.id,
        metadata: {
          name: revokedApiKey.name,
          prefix: revokedApiKey.prefix,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return { revoked: true };
    });
  }
}
