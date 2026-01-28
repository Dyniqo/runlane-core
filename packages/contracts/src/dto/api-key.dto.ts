export interface CreateApiKeyRequestDto {
  readonly name: string;
}

export interface ApiKeyResponseDto {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export interface CurrentApiKeyResponseDto {
  readonly apiKey: {
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly prefix: string;
    readonly lastUsedAt: string;
  };
}

export interface CreateApiKeyResponseDto {
  readonly apiKey: ApiKeyResponseDto;
  readonly token: string;
}

export interface ListApiKeysResponseDto {
  readonly items: readonly ApiKeyResponseDto[];
}

export interface RevokeApiKeyResponseDto {
  readonly revoked: true;
}
