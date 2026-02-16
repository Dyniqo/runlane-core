import { createHash } from 'node:crypto';

import { DomainError } from '../shared';

export const AUTOMATION_BRIDGE_STATUSES = ['accepted'] as const;
export const DEFAULT_AUTOMATION_SOURCE = 'automation_bridge';

export type AutomationBridgeStatus = (typeof AUTOMATION_BRIDGE_STATUSES)[number];
export type AutomationPayloadValue =
  | boolean
  | null
  | number
  | string
  | readonly AutomationPayloadValue[]
  | AutomationPayloadObject;
export interface AutomationPayloadObject {
  readonly [key: string]: AutomationPayloadValue;
}

export interface AutomationBridgeRequest {
  readonly payload: AutomationPayloadObject;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly metadata: AutomationPayloadObject;
  readonly payloadHash: string;
}

export interface ReadAutomationBridgeRequestInput {
  readonly body: unknown;
  readonly source: string | null | undefined;
  readonly idempotencyKey: string | null | undefined;
}

const AUTOMATION_PAYLOAD_MAX_BYTES = 128 * 1024;
const AUTOMATION_SOURCE_MAX_LENGTH = 80;
const AUTOMATION_SOURCE_PATTERN = /^[a-z][a-z0-9._:-]*$/;
const AUTOMATION_IDEMPOTENCY_KEY_MAX_LENGTH = 160;
const AUTOMATION_IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_.:-]+$/;

export function readAutomationBridgeRequest(
  input: ReadAutomationBridgeRequestInput,
): AutomationBridgeRequest {
  if (!isAutomationPayloadObject(input.body)) {
    throw invalidAutomationPayload('Automation bridge request body must be a JSON object');
  }

  const encodedBodyBytes = Buffer.byteLength(JSON.stringify(input.body), 'utf8');

  if (encodedBodyBytes > AUTOMATION_PAYLOAD_MAX_BYTES) {
    throw invalidAutomationPayload('Automation bridge request body exceeds the maximum size');
  }

  const payload = Object.prototype.hasOwnProperty.call(input.body, 'payload')
    ? readAutomationPayload(input.body.payload)
    : input.body;
  const metadata = Object.prototype.hasOwnProperty.call(input.body, 'metadata')
    ? readAutomationMetadata(input.body.metadata)
    : {};
  const bodySource = readOptionalString(
    input.body.source,
    'Automation bridge source must be a string',
  );
  const bodyIdempotencyKey = readOptionalString(
    input.body.idempotencyKey,
    'Automation bridge idempotencyKey must be a string',
  );
  const source = normalizeAutomationSource(bodySource ?? input.source);
  const idempotencyKey = normalizeAutomationIdempotencyKey(
    bodyIdempotencyKey ?? input.idempotencyKey,
  );
  const payloadHash = hashAutomationPayload(payload);

  return {
    payload,
    source,
    idempotencyKey,
    metadata,
    payloadHash,
  };
}

export function hashAutomationPayload(payload: AutomationPayloadObject): string {
  return createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
}

export function normalizeAutomationSource(source: string | null | undefined): string {
  const normalizedSource = (source ?? DEFAULT_AUTOMATION_SOURCE).trim().toLowerCase();

  if (
    normalizedSource.length === 0 ||
    normalizedSource.length > AUTOMATION_SOURCE_MAX_LENGTH ||
    !AUTOMATION_SOURCE_PATTERN.test(normalizedSource)
  ) {
    throw new DomainError({
      code: 'AUTOMATION_SOURCE_INVALID',
      category: 'validation',
      message: 'Automation bridge source is invalid',
    });
  }

  return normalizedSource;
}

export function normalizeAutomationIdempotencyKey(
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
    normalizedKey.length > AUTOMATION_IDEMPOTENCY_KEY_MAX_LENGTH ||
    !AUTOMATION_IDEMPOTENCY_KEY_PATTERN.test(normalizedKey)
  ) {
    throw new DomainError({
      code: 'AUTOMATION_IDEMPOTENCY_KEY_INVALID',
      category: 'validation',
      message: 'Automation bridge idempotency key is invalid',
    });
  }

  return normalizedKey;
}

export function automationWorkflowNotFound(): DomainError {
  return new DomainError({
    code: 'AUTOMATION_WORKFLOW_NOT_FOUND',
    category: 'not_found',
    message: 'Automation workflow was not found',
  });
}

export function automationWorkflowNotAcceptingRequests(): DomainError {
  return new DomainError({
    code: 'AUTOMATION_WORKFLOW_NOT_ACCEPTING_REQUESTS',
    category: 'conflict',
    message: 'Workflow is not configured for automation bridge execution',
  });
}

function readAutomationPayload(payload: unknown): AutomationPayloadObject {
  if (!isAutomationPayloadObject(payload)) {
    throw invalidAutomationPayload('Automation bridge payload must be a JSON object');
  }

  return payload;
}

function readAutomationMetadata(metadata: unknown): AutomationPayloadObject {
  if (!isAutomationPayloadObject(metadata)) {
    throw invalidAutomationPayload('Automation bridge metadata must be a JSON object');
  }

  return metadata;
}

function readOptionalString(value: unknown, message: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw invalidAutomationPayload(message);
  }

  return value;
}

function invalidAutomationPayload(message: string): DomainError {
  return new DomainError({
    code: 'AUTOMATION_PAYLOAD_INVALID',
    category: 'validation',
    message,
  });
}

function isAutomationPayloadObject(value: unknown): value is AutomationPayloadObject {
  return isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item));
}

function isJsonValue(value: unknown): value is AutomationPayloadValue {
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

function stableStringify(value: AutomationPayloadValue): string {
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
