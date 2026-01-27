import { DomainError } from '../shared';

const WORKSPACE_NAME_MIN_LENGTH = 2;
const WORKSPACE_NAME_MAX_LENGTH = 120;

export const WORKSPACE_ROLES = ['owner', 'member'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface WorkspaceAuthorizationScope {
  readonly workspaceId: string;
  readonly workspaceRole: WorkspaceRole;
}

export function normalizeWorkspaceName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, ' ');

  if (
    normalizedName.length < WORKSPACE_NAME_MIN_LENGTH ||
    normalizedName.length > WORKSPACE_NAME_MAX_LENGTH
  ) {
    throw new DomainError({
      code: 'WORKSPACE_NAME_INVALID',
      category: 'validation',
      message: `Workspace name must contain between ${WORKSPACE_NAME_MIN_LENGTH} and ${WORKSPACE_NAME_MAX_LENGTH} characters`,
    });
  }

  return normalizedName;
}

export function assertWorkspaceScopeMatches(
  scope: WorkspaceAuthorizationScope,
  workspaceId: string,
): void {
  if (scope.workspaceId !== workspaceId) {
    throw workspaceAccessDenied();
  }
}

export function assertWorkspaceRole(
  scope: WorkspaceAuthorizationScope,
  allowedRoles: readonly WorkspaceRole[],
): void {
  if (!allowedRoles.includes(scope.workspaceRole)) {
    throw workspaceAccessDenied();
  }
}

export function workspaceAccessDenied(): DomainError {
  return new DomainError({
    code: 'WORKSPACE_ACCESS_DENIED',
    category: 'authorization',
    message: 'Workspace access is denied',
  });
}

export function workspaceMembershipRequired(): DomainError {
  return new DomainError({
    code: 'WORKSPACE_MEMBERSHIP_REQUIRED',
    category: 'authorization',
    message: 'Workspace membership is required',
  });
}
