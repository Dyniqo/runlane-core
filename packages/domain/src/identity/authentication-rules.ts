import { DomainError } from '../shared';

const BEARER_PREFIX = 'Bearer ';

export function readBearerAccessToken(authorizationHeader: string | undefined): string {
  const header = authorizationHeader?.trim();

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw authenticationRequired();
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  if (!token) {
    throw authenticationRequired();
  }

  return token;
}

export function authenticationRequired(): DomainError {
  return new DomainError({
    code: 'AUTHENTICATION_REQUIRED',
    category: 'authentication',
    message: 'Authentication is required',
  });
}

export function invalidCredentials(): DomainError {
  return new DomainError({
    code: 'USER_CREDENTIALS_INVALID',
    category: 'authentication',
    message: 'Email address or password is invalid',
  });
}

export function invalidRefreshToken(): DomainError {
  return new DomainError({
    code: 'REFRESH_TOKEN_INVALID',
    category: 'authentication',
    message: 'Refresh token is invalid',
  });
}
