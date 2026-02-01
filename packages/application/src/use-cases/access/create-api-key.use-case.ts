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
  AuditLogRepositoryPort,
  TransactionBoundary,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildCreateApiKeyResponse } from './api-key-response';

const MAX_API_KEY_GENERATION_ATTEMPTS = 5;

export interface CreateApiKeyUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly name: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class CreateApiKeyUseCase implements UseCase<
  CreateApiKeyUseCaseInput,
  CreateApiKeyResponseDto
> {
  constructor(
    private readonly apiKeys: ApiKeyRepositoryPort,
    private readonly apiKeyTokens: ApiKeyTokenServicePort,
    private readonly auditLogs: AuditLogRepositoryPort,
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

          await this.auditLogs.create({
            workspaceId: input.scope.workspaceId,
            actorUserId: input.scope.userId,
            action: 'access.api_key_created',
            entityType: 'api_key',
            entityId: apiKey.id,
            metadata: {
              name: apiKey.name,
              prefix: apiKey.prefix,
            },
            ip: input.ip,
            userAgent: input.userAgent,
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
