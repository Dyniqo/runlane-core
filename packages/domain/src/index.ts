export {
  authenticationRequired,
  createDefaultWorkspaceName,
  invalidCredentials,
  invalidRefreshToken,
  normalizeUserEmail,
  normalizeUserName,
  readBearerAccessToken,
  validateRegistrationPassword,
} from './identity';
export {
  assertWorkspaceRole,
  assertWorkspaceScopeMatches,
  normalizeWorkspaceName,
  workspaceAccessDenied,
  workspaceMembershipRequired,
  WORKSPACE_ROLES,
} from './workspace';
export type { WorkspaceAuthorizationScope, WorkspaceRole } from './workspace';
export { DOMAIN_ERROR_CATEGORIES, DomainError, isDomainError } from './shared';
export type { DomainErrorCategory, DomainErrorDetails, DomainErrorOptions } from './shared';
