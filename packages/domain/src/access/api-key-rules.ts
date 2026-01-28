import { DomainError } from '../shared';

const API_KEY_NAME_MIN_LENGTH = 2;
const API_KEY_NAME_MAX_LENGTH = 120;
const API_KEY_HEADER_NAME = 'X-Runlane-Api-Key';
const API_KEY_AUTHORIZATION_PREFIX = 'ApiKey ';

export function normalizeApiKeyName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, ' ');

  if (
    normalizedName.length < API_KEY_NAME_MIN_LENGTH ||
    normalizedName.length > API_KEY_NAME_MAX_LENGTH
  ) {
    throw new DomainError({
      code: 'API_KEY_NAME_INVALID',
      category: 'validation',
      message:
        `API key name must contain between ${API_KEY_NAME_MIN_LENGTH} and ` +
        `${API_KEY_NAME_MAX_LENGTH} characters`,
    });
  }

  return normalizedName;
}

export function readApiKeyCredential(input: {
  readonly authorizationHeader: string | undefined;
  readonly apiKeyHeader: string | undefined;
}): string {
  const explicitHeader = input.apiKeyHeader?.trim();

  if (explicitHeader) {
    return explicitHeader;
  }

  const authorizationHeader = input.authorizationHeader?.trim();

  if (!authorizationHeader || !authorizationHeader.startsWith(API_KEY_AUTHORIZATION_PREFIX)) {
    throw apiKeyAuthenticationRequired();
  }

  const apiKey = authorizationHeader.slice(API_KEY_AUTHORIZATION_PREFIX.length).trim();

  if (!apiKey) {
    throw apiKeyAuthenticationRequired();
  }

  return apiKey;
}

export function apiKeyAuthenticationRequired(): DomainError {
  return new DomainError({
    code: 'API_KEY_AUTHENTICATION_REQUIRED',
    category: 'authentication',
    message: `${API_KEY_HEADER_NAME} or ApiKey authorization is required`,
  });
}

export function apiKeyInvalid(): DomainError {
  return new DomainError({
    code: 'API_KEY_INVALID',
    category: 'authentication',
    message: 'API key is invalid',
  });
}

export function apiKeyAccessDenied(): DomainError {
  return new DomainError({
    code: 'API_KEY_ACCESS_DENIED',
    category: 'authorization',
    message: 'API key access is denied',
  });
}
