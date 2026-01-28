import type {
  ApiKeyRepositoryPort,
  ApiKeyTokenServicePort,
  StoredApiKeyCredentialsRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { rejectInvalidApiKey } from './api-key-errors';

export interface ApiKeyScopeRecord {
  readonly apiKeyId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly prefix: string;
  readonly lastUsedAt: Date;
}

export interface ResolveApiKeyUseCaseInput {
  readonly apiKey: string;
  readonly now?: Date;
}

export class ResolveApiKeyUseCase implements UseCase<ResolveApiKeyUseCaseInput, ApiKeyScopeRecord> {
  constructor(
    private readonly apiKeys: ApiKeyRepositoryPort,
    private readonly apiKeyTokens: ApiKeyTokenServicePort,
  ) {}

  async execute(input: ResolveApiKeyUseCaseInput): Promise<ApiKeyScopeRecord> {
    const prefix = this.apiKeyTokens.readPrefix(input.apiKey);
    const candidates = await this.apiKeys.findValidCredentialsByPrefix(prefix);
    const matchedApiKey = await this.findMatchingApiKey(input.apiKey, candidates);

    if (!matchedApiKey) {
      rejectInvalidApiKey();
    }

    const usedAt = input.now ?? new Date();
    const updatedApiKey = await this.apiKeys.markLastUsed({
      id: matchedApiKey.id,
      workspaceId: matchedApiKey.workspaceId,
      usedAt,
    });

    if (!updatedApiKey) {
      rejectInvalidApiKey();
    }

    return {
      apiKeyId: updatedApiKey.id,
      workspaceId: updatedApiKey.workspaceId,
      name: updatedApiKey.name,
      prefix: updatedApiKey.prefix,
      lastUsedAt: usedAt,
    };
  }

  private async findMatchingApiKey(
    apiKey: string,
    candidates: readonly StoredApiKeyCredentialsRecord[],
  ): Promise<StoredApiKeyCredentialsRecord | null> {
    for (const candidate of candidates) {
      const isMatch = await this.apiKeyTokens.verify(apiKey, candidate.keyHash);

      if (isMatch) {
        return candidate;
      }
    }

    return null;
  }
}
