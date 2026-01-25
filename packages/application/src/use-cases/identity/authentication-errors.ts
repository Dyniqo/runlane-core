import { DomainError, invalidCredentials, invalidRefreshToken } from '@runlane/domain';

export function ensureActiveSession(session: {
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
}): void {
  const now = new Date();

  if (session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
    throw invalidRefreshToken();
  }
}

export function missingAuthenticatedUser(): DomainError {
  return new DomainError({
    code: 'AUTHENTICATED_USER_MISSING',
    category: 'authentication',
    message: 'Authenticated user is no longer available',
  });
}

export function missingWorkspaceMembership(): DomainError {
  return new DomainError({
    code: 'WORKSPACE_MEMBERSHIP_MISSING',
    category: 'authorization',
    message: 'Workspace membership is required',
  });
}

export function rejectInvalidCredentials(): never {
  throw invalidCredentials();
}

export function rejectInvalidRefreshToken(): never {
  throw invalidRefreshToken();
}
