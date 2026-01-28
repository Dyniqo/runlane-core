export const API_KEY_REPOSITORY = Symbol('API_KEY_REPOSITORY');

export interface StoredApiKeyRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly prefix: string;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export interface StoredApiKeyCredentialsRecord extends StoredApiKeyRecord {
  readonly keyHash: string;
}

export interface CreateApiKeyInput {
  readonly workspaceId: string;
  readonly name: string;
  readonly prefix: string;
  readonly keyHash: string;
}

export interface RevokeApiKeyInput {
  readonly workspaceId: string;
  readonly id: string;
  readonly revokedAt: Date;
}

export interface MarkApiKeyLastUsedInput {
  readonly workspaceId: string;
  readonly id: string;
  readonly usedAt: Date;
}

export interface ApiKeyRepositoryPort {
  createForWorkspace(input: CreateApiKeyInput): Promise<StoredApiKeyRecord>;
  listForWorkspace(workspaceId: string): Promise<readonly StoredApiKeyRecord[]>;
  findByWorkspaceId(
    input: Readonly<{ workspaceId: string; id: string }>,
  ): Promise<StoredApiKeyRecord | null>;
  findValidCredentialsByPrefix(prefix: string): Promise<readonly StoredApiKeyCredentialsRecord[]>;
  markLastUsed(input: MarkApiKeyLastUsedInput): Promise<StoredApiKeyRecord | null>;
  revokeForWorkspace(input: RevokeApiKeyInput): Promise<StoredApiKeyRecord | null>;
}
