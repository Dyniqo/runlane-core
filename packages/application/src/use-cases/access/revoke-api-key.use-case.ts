import type { RevokeApiKeyResponseDto } from '@runlane/contracts';
import { assertWorkspaceRole } from '@runlane/domain';
import type { ApiKeyRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { rejectApiKeyAccess } from './api-key-errors';

export interface RevokeApiKeyUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly id: string;
}

export class RevokeApiKeyUseCase implements UseCase<
  RevokeApiKeyUseCaseInput,
  RevokeApiKeyResponseDto
> {
  constructor(private readonly apiKeys: ApiKeyRepositoryPort) {}

  async execute(input: RevokeApiKeyUseCaseInput): Promise<RevokeApiKeyResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);

    const revokedApiKey = await this.apiKeys.revokeForWorkspace({
      workspaceId: input.scope.workspaceId,
      id: input.id,
      revokedAt: new Date(),
    });

    if (!revokedApiKey) {
      rejectApiKeyAccess();
    }

    return { revoked: true };
  }
}
