import type {
  ApiKeyResponseDto,
  CreateApiKeyResponseDto,
  ListApiKeysResponseDto,
} from '@runlane/contracts';
import type { StoredApiKeyRecord } from '../../ports';

export function buildApiKeyResponse(apiKey: StoredApiKeyRecord): ApiKeyResponseDto {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
  };
}

export function buildCreateApiKeyResponse(input: {
  readonly apiKey: StoredApiKeyRecord;
  readonly token: string;
}): CreateApiKeyResponseDto {
  return {
    apiKey: buildApiKeyResponse(input.apiKey),
    token: input.token,
  };
}

export function buildListApiKeysResponse(
  apiKeys: readonly StoredApiKeyRecord[],
): ListApiKeysResponseDto {
  return {
    items: apiKeys.map((apiKey) => buildApiKeyResponse(apiKey)),
  };
}
