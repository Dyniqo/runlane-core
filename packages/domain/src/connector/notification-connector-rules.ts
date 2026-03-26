import { DomainError } from '../shared';

export const NOTIFICATION_PROVIDERS = ['slack', 'discord'] as const;
export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'error'] as const;

export type NotificationProvider = (typeof NOTIFICATION_PROVIDERS)[number];
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];
export type NotificationJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly NotificationJsonValue[]
  | NotificationJsonObject;
export interface NotificationJsonObject {
  readonly [key: string]: NotificationJsonValue;
}

export interface NotificationStepConfig {
  readonly provider: NotificationProvider;
  readonly credentialName?: string;
  readonly title?: string;
  readonly message: string;
  readonly severity: NotificationSeverity;
  readonly metadata?: NotificationJsonObject;
  readonly includeExecutionContext: boolean;
}

const PROVIDER_SET = new Set<string>(NOTIFICATION_PROVIDERS);
const SEVERITY_SET = new Set<string>(NOTIFICATION_SEVERITIES);
const CREDENTIAL_NAME_PATTERN = /^[a-z][a-z0-9_.:-]{1,119}$/;
const MESSAGE_MAX_LENGTH = 3500;
const TITLE_MAX_LENGTH = 160;
const METADATA_MAX_BYTES = 8192;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function readNotificationStepConfig(input: unknown): NotificationStepConfig {
  if (!isPlainObject(input)) {
    throw notificationConfigInvalid('Notification step config must be a JSON object');
  }

  return {
    provider: readProvider(input.provider),
    ...(input.credentialName !== undefined
      ? { credentialName: readOptionalCredentialName(input.credentialName) }
      : {}),
    ...(input.title !== undefined ? { title: readOptionalTitle(input.title) } : {}),
    message: readMessage(input.message),
    severity: readOptionalSeverity(input.severity),
    ...(input.metadata !== undefined ? { metadata: readOptionalMetadata(input.metadata) } : {}),
    includeExecutionContext: readOptionalIncludeExecutionContext(input.includeExecutionContext),
  };
}

export function notificationConfigInvalid(message: string): DomainError {
  return new DomainError({
    code: 'NOTIFICATION_CONFIG_INVALID',
    category: 'validation',
    message,
  });
}

export function notificationWebhookMissing(provider: NotificationProvider): DomainError {
  return new DomainError({
    code: 'NOTIFICATION_WEBHOOK_MISSING',
    category: 'validation',
    message: `No ${provider} notification webhook is configured`,
    details: { provider },
  });
}

export function notificationWebhookInvalid(provider: NotificationProvider): DomainError {
  return new DomainError({
    code: 'NOTIFICATION_WEBHOOK_INVALID',
    category: 'validation',
    message: `${provider} notification webhook URL is invalid`,
    details: { provider },
  });
}

function readProvider(value: unknown): NotificationProvider {
  if (typeof value !== 'string') {
    throw notificationConfigInvalid('Notification provider must be a string');
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!PROVIDER_SET.has(normalizedValue)) {
    throw notificationConfigInvalid('Notification provider is not supported');
  }

  return normalizedValue as NotificationProvider;
}

function readOptionalCredentialName(value: unknown): string {
  if (typeof value !== 'string') {
    throw notificationConfigInvalid('Notification credentialName must be a string');
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!CREDENTIAL_NAME_PATTERN.test(normalizedValue)) {
    throw notificationConfigInvalid('Notification credentialName is invalid');
  }

  return normalizedValue;
}

function readOptionalTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw notificationConfigInvalid('Notification title must be a string');
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > TITLE_MAX_LENGTH) {
    throw notificationConfigInvalid('Notification title is invalid');
  }

  return normalizedValue;
}

function readMessage(value: unknown): string {
  if (typeof value !== 'string') {
    throw notificationConfigInvalid('Notification message must be a string');
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > MESSAGE_MAX_LENGTH) {
    throw notificationConfigInvalid('Notification message is invalid');
  }

  return normalizedValue;
}

function readOptionalSeverity(value: unknown): NotificationSeverity {
  if (value === undefined || value === null) {
    return 'info';
  }

  if (typeof value !== 'string') {
    throw notificationConfigInvalid('Notification severity must be a string');
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!SEVERITY_SET.has(normalizedValue)) {
    throw notificationConfigInvalid('Notification severity is invalid');
  }

  return normalizedValue as NotificationSeverity;
}

function readOptionalMetadata(value: unknown): NotificationJsonObject {
  if (!isPlainObject(value)) {
    throw notificationConfigInvalid('Notification metadata must be a JSON object');
  }

  const sanitizedValue = sanitizeJsonObject(value);
  const encodedBytes = Buffer.byteLength(JSON.stringify(sanitizedValue), 'utf8');

  if (encodedBytes > METADATA_MAX_BYTES) {
    throw notificationConfigInvalid('Notification metadata exceeds the maximum accepted size');
  }

  return sanitizedValue;
}

function readOptionalIncludeExecutionContext(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== 'boolean') {
    throw notificationConfigInvalid('Notification includeExecutionContext must be a boolean');
  }

  return value;
}

function sanitizeJsonObject(value: Readonly<Record<string, unknown>>): NotificationJsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (UNSAFE_OBJECT_KEYS.has(key)) {
        throw notificationConfigInvalid('Notification metadata contains an unsafe key');
      }

      return [key, sanitizeJsonValue(nestedValue)];
    }),
  );
}

function sanitizeJsonValue(value: unknown): NotificationJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }

  if (isPlainObject(value)) {
    return sanitizeJsonObject(value);
  }

  throw notificationConfigInvalid('Notification metadata must contain JSON values');
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
