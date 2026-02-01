export { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from './audit';
export type { AuditAction, AuditEntityType } from './audit';
export {
  apiKeyAccessDenied,
  apiKeyAuthenticationRequired,
  apiKeyInvalid,
  normalizeApiKeyName,
  readApiKeyCredential,
} from './access';
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
