export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface StoredSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId: string | null;
  readonly refreshTokenHash: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly refreshTokenHash: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
  readonly expiresAt: Date;
}

export interface RotateSessionRefreshTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly currentRefreshTokenHash: string;
  readonly nextRefreshTokenHash: string;
  readonly expiresAt: Date;
}

export interface RevokeSessionInput {
  readonly id: string;
  readonly refreshTokenHash: string;
  readonly revokedAt: Date;
}

export interface SessionRepositoryPort {
  create(input: CreateSessionInput): Promise<StoredSessionRecord>;
  findById(sessionId: string): Promise<StoredSessionRecord | null>;
  rotateRefreshToken(input: RotateSessionRefreshTokenInput): Promise<StoredSessionRecord | null>;
  revoke(input: RevokeSessionInput): Promise<boolean>;
}
