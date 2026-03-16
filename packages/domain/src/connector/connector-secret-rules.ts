import { DomainError } from '../shared';

export const CONNECTOR_CREDENTIAL_TYPES = [
  'api_key',
  'bearer_token',
  'basic_auth',
  'custom_header',
  'webhook_url',
  'generic',
] as const;

export type ConnectorCredentialType = (typeof CONNECTOR_CREDENTIAL_TYPES)[number];

const WORKFLOW_SECRET_KEY_PATTERN = /^[a-z][a-z0-9_]{1,127}$/;
const CONNECTOR_CREDENTIAL_NAME_PATTERN = /^[a-z][a-z0-9_.:-]{1,119}$/;
const CONNECTOR_CREDENTIAL_TYPE_SET = new Set<string>(CONNECTOR_CREDENTIAL_TYPES);
const SECRET_VALUE_MIN_LENGTH = 1;
const SECRET_VALUE_MAX_LENGTH = 8192;
const CONNECTOR_CREDENTIAL_METADATA_MAX_BYTES = 16 * 1024;

export function normalizeWorkflowSecretKey(key: string): string {
  const normalizedKey = key.trim().toLowerCase();

  if (!WORKFLOW_SECRET_KEY_PATTERN.test(normalizedKey)) {
    throw new DomainError({
      code: 'WORKFLOW_SECRET_KEY_INVALID',
      category: 'validation',
      message: 'Workflow secret key is invalid',
    });
  }

  return normalizedKey;
}

export function readSecretValue(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new DomainError({
      code: 'SECRET_VALUE_INVALID',
      category: 'validation',
      message,
    });
  }

  if (value.length < SECRET_VALUE_MIN_LENGTH || value.length > SECRET_VALUE_MAX_LENGTH) {
    throw new DomainError({
      code: 'SECRET_VALUE_INVALID',
      category: 'validation',
      message,
    });
  }

  return value;
}

export function normalizeConnectorCredentialName(name: string): string {
  const normalizedName = name.trim().toLowerCase();

  if (!CONNECTOR_CREDENTIAL_NAME_PATTERN.test(normalizedName)) {
    throw new DomainError({
      code: 'CONNECTOR_CREDENTIAL_NAME_INVALID',
      category: 'validation',
      message: 'Connector credential name is invalid',
    });
  }

  return normalizedName;
}

export function normalizeConnectorCredentialType(type: string): ConnectorCredentialType {
  const normalizedType = type.trim().toLowerCase();

  if (!CONNECTOR_CREDENTIAL_TYPE_SET.has(normalizedType)) {
    throw new DomainError({
      code: 'CONNECTOR_CREDENTIAL_TYPE_INVALID',
      category: 'validation',
      message: 'Connector credential type is invalid',
    });
  }

  return normalizedType as ConnectorCredentialType;
}

export function readConnectorCredentialMetadata(value: unknown): Readonly<Record<string, unknown>> {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new DomainError({
      code: 'CONNECTOR_CREDENTIAL_METADATA_INVALID',
      category: 'validation',
      message: 'Connector credential metadata must be a JSON object',
    });
  }

  const encodedMetadataBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');

  if (encodedMetadataBytes > CONNECTOR_CREDENTIAL_METADATA_MAX_BYTES) {
    throw new DomainError({
      code: 'CONNECTOR_CREDENTIAL_METADATA_TOO_LARGE',
      category: 'validation',
      message: 'Connector credential metadata exceeds the maximum accepted size',
    });
  }

  return sanitizeMetadataObject(value);
}

export function workflowSecretNotFound(): DomainError {
  return new DomainError({
    code: 'WORKFLOW_SECRET_NOT_FOUND',
    category: 'not_found',
    message: 'Workflow secret was not found',
  });
}

export function connectorCredentialNotFound(): DomainError {
  return new DomainError({
    code: 'CONNECTOR_CREDENTIAL_NOT_FOUND',
    category: 'not_found',
    message: 'Connector credential was not found',
  });
}

export function connectorCredentialSecretMissing(key: string): DomainError {
  return new DomainError({
    code: 'WORKFLOW_SECRET_REFERENCE_NOT_FOUND',
    category: 'validation',
    message: `Workflow secret '${key}' was not found`,
    details: { key },
  });
}

export function maskSecretValue(): string {
  return '********';
}

function sanitizeMetadataObject(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new DomainError({
          code: 'CONNECTOR_CREDENTIAL_METADATA_INVALID',
          category: 'validation',
          message: 'Connector credential metadata contains an unsafe key',
        });
      }

      return [key, sanitizeMetadataValue(nestedValue)];
    }),
  );
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item));
  }

  if (isPlainObject(value)) {
    return sanitizeMetadataObject(value);
  }

  throw new DomainError({
    code: 'CONNECTOR_CREDENTIAL_METADATA_INVALID',
    category: 'validation',
    message: 'Connector credential metadata must contain JSON values',
  });
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
