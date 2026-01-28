import { apiKeyAccessDenied, apiKeyInvalid } from '@runlane/domain';

export function rejectInvalidApiKey(): never {
  throw apiKeyInvalid();
}

export function rejectApiKeyAccess(): never {
  throw apiKeyAccessDenied();
}
