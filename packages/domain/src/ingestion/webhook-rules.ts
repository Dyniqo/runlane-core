import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { DomainError } from '../shared';

export const WEBHOOK_REQUEST_STATUSES = ['accepted', 'rejected'] as const;
export const DEFAULT_WEBHOOK_SOURCE = 'public_webhook';
export const WEBHOOK_SIGNATURE_SCHEME = 'v1';

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

export interface VerifiedWebhookSignature {
  readonly timestampSeconds: number;
  readonly digest: string;
  readonly replayKeyHash: string;
}

export interface VerifyWebhookSignatureInput {
  readonly signature: string | null;
  readonly payloadHash: string;
  readonly signingSecret: string;
  readonly now: Date;
  readonly toleranceSeconds: number;
}

const WEBHOOK_PAYLOAD_MAX_BYTES = 128 * 1024;
const WEBHOOK_SOURCE_MAX_LENGTH = 80;
const WEBHOOK_SOURCE_PATTERN = /^[a-z][a-z0-9._:-]*$/;
const WEBHOOK_SIGNATURE_MAX_LENGTH = 512;
const WEBHOOK_IDEMPOTENCY_KEY_MAX_LENGTH = 160;
const WEBHOOK_IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_.:-]+$/;
const WEBHOOK_SIGNATURE_DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const WEBHOOK_SIGNATURE_TIMESTAMP_MAX_AGE_SECONDS = 24 * 60 * 60;

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

export function hashWebhookRuntimeKey(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
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

export function verifyWebhookSignature(
  input: VerifyWebhookSignatureInput,
): VerifiedWebhookSignature {
  if (!input.signature) {
    throw new DomainError({
      code: 'WEBHOOK_SIGNATURE_REQUIRED',
      category: 'authentication',
      message: 'Webhook signature is required',
    });
  }

  const parsedSignature = parseWebhookSignature(input.signature);
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  const absoluteAgeSeconds = Math.abs(nowSeconds - parsedSignature.timestampSeconds);

  if (
    parsedSignature.timestampSeconds <= 0 ||
    parsedSignature.timestampSeconds > nowSeconds + input.toleranceSeconds ||
    absoluteAgeSeconds > input.toleranceSeconds ||
    absoluteAgeSeconds > WEBHOOK_SIGNATURE_TIMESTAMP_MAX_AGE_SECONDS
  ) {
    throw new DomainError({
      code: 'WEBHOOK_SIGNATURE_TIMESTAMP_INVALID',
      category: 'authentication',
      message: 'Webhook signature timestamp is outside the accepted window',
    });
  }

  const expectedDigest = createHmac('sha256', input.signingSecret)
    .update(
      buildWebhookSignaturePayload(parsedSignature.timestampSeconds, input.payloadHash),
      'utf8',
    )
    .digest('hex');

  if (!timingSafeWebhookDigestEqual(parsedSignature.digest, expectedDigest)) {
    throw new DomainError({
      code: 'WEBHOOK_SIGNATURE_MISMATCH',
      category: 'authentication',
      message: 'Webhook signature verification failed',
    });
  }

  return {
    timestampSeconds: parsedSignature.timestampSeconds,
    digest: parsedSignature.digest.toLowerCase(),
    replayKeyHash: hashWebhookRuntimeKey(input.signature),
  };
}

export function buildWebhookSignaturePayload(
  timestampSeconds: number,
  payloadHash: string,
): string {
  return `${timestampSeconds}.${payloadHash}`;
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

export function webhookReplayDetected(): DomainError {
  return new DomainError({
    code: 'WEBHOOK_REPLAY_DETECTED',
    category: 'conflict',
    message: 'Webhook signature has already been used',
  });
}

export function webhookIdempotencyConflict(): DomainError {
  return new DomainError({
    code: 'WEBHOOK_IDEMPOTENCY_CONFLICT',
    category: 'conflict',
    message: 'Webhook idempotency key was already used with a different payload',
  });
}

export function webhookIdempotencyInProgress(): DomainError {
  return new DomainError({
    code: 'WEBHOOK_IDEMPOTENCY_IN_PROGRESS',
    category: 'conflict',
    message: 'Webhook idempotency key is already being processed',
  });
}

function parseWebhookSignature(signature: string): {
  readonly timestampSeconds: number;
  readonly digest: string;
} {
  const values = new Map<string, string>();

  for (const segment of signature.split(',')) {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex <= 0) {
      throw invalidWebhookSignature();
    }

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      throw invalidWebhookSignature();
    }

    values.set(key, value);
  }

  const timestamp = values.get('t');
  const digest = values.get(WEBHOOK_SIGNATURE_SCHEME);

  if (!timestamp || !digest || !/^\d{10,}$/.test(timestamp)) {
    throw invalidWebhookSignature();
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isSafeInteger(timestampSeconds) || !WEBHOOK_SIGNATURE_DIGEST_PATTERN.test(digest)) {
    throw invalidWebhookSignature();
  }

  return {
    timestampSeconds,
    digest,
  };
}

function invalidWebhookSignature(): DomainError {
  return new DomainError({
    code: 'WEBHOOK_SIGNATURE_INVALID',
    category: 'authentication',
    message: 'Webhook signature is invalid',
  });
}

function timingSafeWebhookDigestEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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
