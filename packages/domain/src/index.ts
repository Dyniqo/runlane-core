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
export { DOMAIN_ERROR_CATEGORIES, DomainError, isDomainError } from './shared';
export type { DomainErrorCategory, DomainErrorDetails, DomainErrorOptions } from './shared';
