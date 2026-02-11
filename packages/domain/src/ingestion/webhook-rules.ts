import { createHash } from 'node:crypto';

import { DomainError } from '../shared';

export const WEBHOOK_REQUEST_STATUSES = ['accepted', 'rejected'] as const;
export const DEFAULT_WEBHOOK_SOURCE = 'public_webhook';

export type WebhookRequestStatus = (typeof WEBHOOK_REQUEST_STATUSES)[number];
export type WebhookPayloadValue =
  | boolean
  | null
  | number
  | string
  | readonly WebhookPayloadValue[]
  | WebhookPayloadObject;
export interface WebhookPayloadObject {
  readonly [key: string]: WebhookPayloadValue;
}

const WEBHOOK_PAYLOAD_MAX_BYTES = 128 * 1024;
const WEBHOOK_SOURCE_MAX_LENGTH = 80;
const WEBHOOK_SOURCE_PATTERN = /^[a-z][a-z0-9._:-]*$/;
const WEBHOOK_SIGNATURE_MAX_LENGTH = 512;
const WEBHOOK_IDEMPOTENCY_KEY_MAX_LENGTH = 160;
const WEBHOOK_IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_.:-]+$/;

export function readWebhookPayload(payload: unknown): WebhookPayloadObject {
  if (!isWebhookPayloadObject(payload)) {
    throw new DomainError({
      code: 'WEBHOOK_PAYLOAD_INVALID',
      category: 'validation',
      message: 'Webhook payload must be a JSON object',
    });
  }

  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');

  if (payloadBytes > WEBHOOK_PAYLOAD_MAX_BYTES) {
    throw new DomainError({
      code: 'WEBHOOK_PAYLOAD_TOO_LARGE',
      category: 'validation',
      message: 'Webhook payload exceeds the maximum accepted size',
    });
  }

  return payload;
}

export function hashWebhookPayload(payload: WebhookPayloadObject): string {
  return createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
}

export function normalizeWebhookSource(source: string | null | undefined): string {
  const normalizedSource = (source ?? DEFAULT_WEBHOOK_SOURCE).trim().toLowerCase();

  if (
    normalizedSource.length === 0 ||
    normalizedSource.length > WEBHOOK_SOURCE_MAX_LENGTH ||
    !WEBHOOK_SOURCE_PATTERN.test(normalizedSource)
  ) {
    throw new DomainError({
      code: 'WEBHOOK_SOURCE_INVALID',
      category: 'validation',
      message: 'Webhook source is invalid',
    });
  }

  return normalizedSource;
}

export function normalizeWebhookSignature(signature: string | null | undefined): string | null {
  if (signature === undefined || signature === null) {
    return null;
  }

  const normalizedSignature = signature.trim();

  if (normalizedSignature.length === 0) {
    return null;
  }

  if (normalizedSignature.length > WEBHOOK_SIGNATURE_MAX_LENGTH) {
    throw new DomainError({
      code: 'WEBHOOK_SIGNATURE_INVALID',
      category: 'validation',
      message: 'Webhook signature is invalid',
    });
  }

  return normalizedSignature;
}

export function normalizeWebhookIdempotencyKey(
  idempotencyKey: string | null | undefined,
): string | null {
  if (idempotencyKey === undefined || idempotencyKey === null) {
    return null;
  }

  const normalizedKey = idempotencyKey.trim();

  if (normalizedKey.length === 0) {
    return null;
  }

  if (
    normalizedKey.length > WEBHOOK_IDEMPOTENCY_KEY_MAX_LENGTH ||
    !WEBHOOK_IDEMPOTENCY_KEY_PATTERN.test(normalizedKey)
  ) {
    throw new DomainError({
      code: 'WEBHOOK_IDEMPOTENCY_KEY_INVALID',
      category: 'validation',
      message: 'Webhook idempotency key is invalid',
    });
  }

  return normalizedKey;
}

export function webhookWorkflowNotFound(): DomainError {
  return new DomainError({
    code: 'WEBHOOK_WORKFLOW_NOT_FOUND',
    category: 'not_found',
    message: 'Webhook workflow was not found',
  });
}

export function webhookWorkflowNotAcceptingRequests(): DomainError {
  return new DomainError({
    code: 'WEBHOOK_WORKFLOW_NOT_ACCEPTING_REQUESTS',
    category: 'conflict',
    message: 'Workflow is not configured for webhook ingestion',
  });
}

function isWebhookPayloadObject(value: unknown): value is WebhookPayloadObject {
  return isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item));
}

function isJsonValue(value: unknown): value is WebhookPayloadValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;

  if (valueType === 'string' || valueType === 'boolean') {
    return true;
  }

  if (valueType === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isPlainObject(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}

function stableStringify(value: WebhookPayloadValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
