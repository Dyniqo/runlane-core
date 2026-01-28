import type { ListApiKeysResponseDto } from '@runlane/contracts';
import type { ApiKeyRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { buildListApiKeysResponse } from './api-key-response';

export interface ListApiKeysUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
}

export class ListApiKeysUseCase implements UseCase<
  ListApiKeysUseCaseInput,
  ListApiKeysResponseDto
> {
  constructor(private readonly apiKeys: ApiKeyRepositoryPort) {}

  async execute(input: ListApiKeysUseCaseInput): Promise<ListApiKeysResponseDto> {
    const apiKeys = await this.apiKeys.listForWorkspace(input.scope.workspaceId);

    return buildListApiKeysResponse(apiKeys);
  }
}
