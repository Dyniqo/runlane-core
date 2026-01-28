import type { CreateApiKeyResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  DomainError,
  isDomainError,
  normalizeApiKeyName,
} from '@runlane/domain';
import type {
  ApiKeyRepositoryPort,
  ApiKeyTokenServicePort,
  TransactionBoundary,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildCreateApiKeyResponse } from './api-key-response';

const MAX_API_KEY_GENERATION_ATTEMPTS = 5;

export interface CreateApiKeyUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly name: string;
}

export class CreateApiKeyUseCase implements UseCase<
  CreateApiKeyUseCaseInput,
  CreateApiKeyResponseDto
> {
  constructor(
    private readonly apiKeys: ApiKeyRepositoryPort,
    private readonly apiKeyTokens: ApiKeyTokenServicePort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  async execute(input: CreateApiKeyUseCaseInput): Promise<CreateApiKeyResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const name = normalizeApiKeyName(input.name);

    for (let attempt = 1; attempt <= MAX_API_KEY_GENERATION_ATTEMPTS; attempt += 1) {
      const generatedKey = this.apiKeyTokens.generate();

      try {
        return await this.transactionBoundary.execute(async () => {
          const keyHash = await this.apiKeyTokens.hash(generatedKey.token);
          const apiKey = await this.apiKeys.createForWorkspace({
            workspaceId: input.scope.workspaceId,
            name,
            prefix: generatedKey.prefix,
            keyHash,
          });

          return buildCreateApiKeyResponse({ apiKey, token: generatedKey.token });
        });
      } catch (error) {
        if (!isRetryableApiKeyGenerationError(error, attempt)) {
          throw error;
        }
      }
    }

    throw new DomainError({
      code: 'API_KEY_GENERATION_FAILED',
      category: 'conflict',
      message: 'API key generation failed',
    });
  }
}

function isRetryableApiKeyGenerationError(error: unknown, attempt: number): boolean {
  return (
    isDomainError(error) &&
    error.code === 'API_KEY_PREFIX_COLLISION' &&
    attempt < MAX_API_KEY_GENERATION_ATTEMPTS
  );
}
