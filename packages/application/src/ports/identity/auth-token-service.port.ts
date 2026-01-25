export const AUTH_TOKEN_SERVICE = Symbol('AUTH_TOKEN_SERVICE');

export interface AccessTokenSubject {
  readonly userId: string;
  readonly email: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly workspaceRole: 'owner' | 'member';
}

export interface AccessTokenPrincipal extends AccessTokenSubject {
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly tokenId: string;
}

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
  readonly expiresInSeconds: number;
}

export interface IssuedRefreshToken {
  readonly token: string;
}

export interface AuthTokenServicePort {
  createSessionId(): string;
  issueAccessToken(subject: AccessTokenSubject, now: Date): Promise<IssuedAccessToken>;
  verifyAccessToken(token: string, now: Date): Promise<AccessTokenPrincipal>;
  issueRefreshToken(sessionId: string): Promise<IssuedRefreshToken>;
  readRefreshSessionId(refreshToken: string): string;
  hashRefreshToken(refreshToken: string): Promise<string>;
  isRefreshTokenHashMatch(refreshToken: string, expectedHash: string): Promise<boolean>;
  getRefreshTokenExpiresAt(now: Date): Date;
}
