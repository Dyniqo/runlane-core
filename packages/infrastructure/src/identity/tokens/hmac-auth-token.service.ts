import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import type {
  AccessTokenPrincipal,
  AccessTokenSubject,
  AuthTokenServicePort,
  IssuedAccessToken,
  IssuedRefreshToken,
} from '@runlane/application';
import { DomainError, invalidRefreshToken } from '@runlane/domain';

const ACCESS_TOKEN_ISSUER = 'runlane-core';
const ACCESS_TOKEN_AUDIENCE = 'runlane-api';
const ACCESS_TOKEN_TYPE = 'access';
const ACCESS_TOKEN_ALGORITHM = 'HS256';
const REFRESH_TOKEN_VERSION = 'rlr.v1';
const REFRESH_TOKEN_SECRET_BYTES = 48;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AccessTokenClaims {
  readonly iss: string;
  readonly aud: string;
  readonly typ: string;
  readonly sub: string;
  readonly email: string;
  readonly sid: string;
  readonly wid: string;
  readonly role: 'owner' | 'member';
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

@Injectable()
export class HmacAuthTokenService implements AuthTokenServicePort {
  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  createSessionId(): string {
    return randomUUID();
  }

  async issueAccessToken(subject: AccessTokenSubject, now: Date): Promise<IssuedAccessToken> {
    const issuedAt = secondsFromDate(now);
    const expiresAt = issuedAt + this.config.accessTokenTtlSeconds;
    const claims: AccessTokenClaims = {
      iss: ACCESS_TOKEN_ISSUER,
      aud: ACCESS_TOKEN_AUDIENCE,
      typ: ACCESS_TOKEN_TYPE,
      sub: subject.userId,
      email: subject.email,
      sid: subject.sessionId,
      wid: subject.workspaceId,
      role: subject.workspaceRole,
      iat: issuedAt,
      exp: expiresAt,
      jti: randomUUID(),
    };
    const token = signJwt(claims, this.config.jwtAccessSecret);

    return {
      token,
      expiresAt: dateFromSeconds(expiresAt),
      expiresInSeconds: this.config.accessTokenTtlSeconds,
    };
  }

  async verifyAccessToken(token: string, now: Date): Promise<AccessTokenPrincipal> {
    const claims = verifyJwt(token, this.config.jwtAccessSecret);
    const nowSeconds = secondsFromDate(now);

    if (claims.exp <= nowSeconds) {
      throw invalidAccessToken();
    }

    return {
      userId: claims.sub,
      email: claims.email,
      sessionId: claims.sid,
      workspaceId: claims.wid,
      workspaceRole: claims.role,
      issuedAt: dateFromSeconds(claims.iat),
      expiresAt: dateFromSeconds(claims.exp),
      tokenId: claims.jti,
    };
  }

  async issueRefreshToken(sessionId: string): Promise<IssuedRefreshToken> {
    if (!UUID_PATTERN.test(sessionId)) {
      throw invalidRefreshToken();
    }

    return {
      token: [
        REFRESH_TOKEN_VERSION,
        sessionId,
        randomBytes(REFRESH_TOKEN_SECRET_BYTES).toString('base64url'),
      ].join('.'),
    };
  }

  readRefreshSessionId(refreshToken: string): string {
    const parsedToken = parseRefreshToken(refreshToken);

    if (!parsedToken) {
      throw invalidRefreshToken();
    }

    return parsedToken.sessionId;
  }

  async hashRefreshToken(refreshToken: string): Promise<string> {
    return createHmac('sha256', this.config.jwtRefreshSecret)
      .update(refreshToken)
      .digest('base64url');
  }

  async isRefreshTokenHashMatch(refreshToken: string, expectedHash: string): Promise<boolean> {
    const tokenHash = await this.hashRefreshToken(refreshToken);
    const tokenHashBuffer = Buffer.from(tokenHash, 'utf8');
    const expectedHashBuffer = Buffer.from(expectedHash, 'utf8');

    if (tokenHashBuffer.byteLength !== expectedHashBuffer.byteLength) {
      return false;
    }

    return timingSafeEqual(tokenHashBuffer, expectedHashBuffer);
  }

  getRefreshTokenExpiresAt(now: Date): Date {
    return new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1000);
  }
}

function signJwt(claims: AccessTokenClaims, secret: string): string {
  const header = encodeJson({ alg: ACCESS_TOKEN_ALGORITHM, typ: 'JWT' });
  const payload = encodeJson(claims);
  const signature = sign(`${header}.${payload}`, secret);

  return `${header}.${payload}.${signature}`;
}

function verifyJwt(token: string, secret: string): AccessTokenClaims {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw invalidAccessToken();
  }

  const header = parts[0];
  const payload = parts[1];
  const signature = parts[2];

  if (!header || !payload || !signature) {
    throw invalidAccessToken();
  }

  const expectedSignature = sign(`${header}.${payload}`, secret);

  if (!safeEqual(signature, expectedSignature)) {
    throw invalidAccessToken();
  }

  const parsedHeader = decodeJson(header);

  if (
    !isRecord(parsedHeader) ||
    parsedHeader.alg !== ACCESS_TOKEN_ALGORITHM ||
    parsedHeader.typ !== 'JWT'
  ) {
    throw invalidAccessToken();
  }

  const parsedClaims = decodeJson(payload);

  if (!isAccessTokenClaims(parsedClaims)) {
    throw invalidAccessToken();
  }

  return parsedClaims;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw invalidAccessToken();
  }
}

function isAccessTokenClaims(value: unknown): value is AccessTokenClaims {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.iss === ACCESS_TOKEN_ISSUER &&
    value.aud === ACCESS_TOKEN_AUDIENCE &&
    value.typ === ACCESS_TOKEN_TYPE &&
    typeof value.sub === 'string' &&
    typeof value.email === 'string' &&
    typeof value.sid === 'string' &&
    typeof value.wid === 'string' &&
    (value.role === 'owner' || value.role === 'member') &&
    typeof value.iat === 'number' &&
    typeof value.exp === 'number' &&
    typeof value.jti === 'string' &&
    Number.isInteger(value.iat) &&
    Number.isInteger(value.exp)
  );
}

function parseRefreshToken(value: string): { readonly sessionId: string } | null {
  const parts = value.trim().split('.');

  if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== REFRESH_TOKEN_VERSION) {
    return null;
  }

  const sessionId = parts[2];
  const secret = parts[3];

  if (!sessionId || !secret || !UUID_PATTERN.test(sessionId) || secret.length < 64) {
    return null;
  }

  return { sessionId };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function secondsFromDate(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function dateFromSeconds(value: number): Date {
  return new Date(value * 1000);
}

function invalidAccessToken(): DomainError {
  return new DomainError({
    code: 'ACCESS_TOKEN_INVALID',
    category: 'authentication',
    message: 'Access token is invalid',
  });
}
