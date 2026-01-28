import { Inject, Injectable } from '@nestjs/common';
import type {
  ApiKeyRepositoryPort,
  CreateApiKeyInput,
  MarkApiKeyLastUsedInput,
  RevokeApiKeyInput,
  StoredApiKeyCredentialsRecord,
  StoredApiKeyRecord,
} from '@runlane/application';
import { DomainError } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaApiKeyRepository implements ApiKeyRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async createForWorkspace(input: CreateApiKeyInput): Promise<StoredApiKeyRecord> {
    try {
      return await this.persistence.client.apiKey.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          prefix: input.prefix,
          keyHash: input.keyHash,
        },
        select: apiKeySelect,
      });
    } catch (error) {
      if (isPrismaKnownRequestError(error, 'P2002')) {
        throw new DomainError({
          code: 'API_KEY_PREFIX_COLLISION',
          category: 'conflict',
          message: 'API key prefix collision occurred',
          cause: error,
        });
      }

      throw error;
    }
  }

  async listForWorkspace(workspaceId: string): Promise<readonly StoredApiKeyRecord[]> {
    return this.persistence.client.apiKey.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'desc' }],
      select: apiKeySelect,
    });
  }

  async findByWorkspaceId(input: {
    readonly workspaceId: string;
    readonly id: string;
  }): Promise<StoredApiKeyRecord | null> {
    return this.persistence.client.apiKey.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
      select: apiKeySelect,
    });
  }

  async findValidCredentialsByPrefix(
    prefix: string,
  ): Promise<readonly StoredApiKeyCredentialsRecord[]> {
    return this.persistence.client.apiKey.findMany({
      where: {
        prefix,
        revokedAt: null,
      },
      select: apiKeyCredentialsSelect,
    });
  }

  async markLastUsed(input: MarkApiKeyLastUsedInput): Promise<StoredApiKeyRecord | null> {
    const updated = await this.persistence.client.apiKey.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        revokedAt: null,
      },
      data: {
        lastUsedAt: input.usedAt,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByWorkspaceId({ id: input.id, workspaceId: input.workspaceId });
  }

  async revokeForWorkspace(input: RevokeApiKeyInput): Promise<StoredApiKeyRecord | null> {
    const updated = await this.persistence.client.apiKey.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        revokedAt: null,
      },
      data: {
        revokedAt: input.revokedAt,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByWorkspaceId({ id: input.id, workspaceId: input.workspaceId });
  }
}

const apiKeySelect = {
  id: true,
  workspaceId: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

const apiKeyCredentialsSelect = {
  ...apiKeySelect,
  keyHash: true,
} as const;

function isPrismaKnownRequestError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as Readonly<Record<'code', unknown>>).code === code
  );
}
