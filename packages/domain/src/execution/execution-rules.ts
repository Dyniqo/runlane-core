import { DomainError } from '../shared';

export const EXECUTION_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'retrying',
  'dead_letter',
  'cancelled',
] as const;

export const EXECUTION_TRIGGER_TYPES = ['webhook', 'automation_bridge', 'manual'] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export type ExecutionTriggerType = (typeof EXECUTION_TRIGGER_TYPES)[number];
export type ExecutionInputJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly ExecutionInputJsonValue[]
  | ExecutionInputJsonObject;
export interface ExecutionInputJsonObject {
  readonly [key: string]: ExecutionInputJsonValue;
}

export interface ExecutionTriggerReference extends ExecutionInputJsonObject {
  readonly type: ExecutionTriggerType;
  readonly sourceId: string;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly acceptedAt: string;
}

export interface ExecutionInputEnvelope extends ExecutionInputJsonObject {
  readonly trigger: ExecutionTriggerReference;
  readonly payload: ExecutionInputJsonObject;
  readonly metadata: ExecutionInputJsonObject;
}

export interface BuildExecutionInputEnvelopeInput {
  readonly triggerType: ExecutionTriggerType;
  readonly sourceId: string;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly acceptedAt: Date;
  readonly payload: ExecutionInputJsonObject;
  readonly metadata?: ExecutionInputJsonObject;
}

const EXECUTION_INPUT_MAX_BYTES = 256 * 1024;
const EXECUTION_SOURCE_ID_MAX_LENGTH = 128;
const EXECUTION_SOURCE_MAX_LENGTH = 80;
const EXECUTION_TERMINAL_STATUSES = new Set<ExecutionStatus>([
  'succeeded',
  'dead_letter',
  'cancelled',
]);
const EXECUTION_TRANSITIONS: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'retrying', 'cancelled'],
  succeeded: [],
  failed: ['queued', 'dead_letter', 'cancelled'],
  retrying: ['queued', 'dead_letter', 'cancelled'],
  dead_letter: ['queued'],
  cancelled: [],
};

export function buildExecutionInputEnvelope(
  input: BuildExecutionInputEnvelopeInput,
): ExecutionInputEnvelope {
  const triggerType = readExecutionTriggerType(input.triggerType);
  const sourceId = readBoundedString(
    input.sourceId,
    EXECUTION_SOURCE_ID_MAX_LENGTH,
    'Execution trigger source id is invalid',
  );
  const source = readBoundedString(
    input.source,
    EXECUTION_SOURCE_MAX_LENGTH,
    'Execution trigger source is invalid',
  );
  const metadata = input.metadata ?? {};
  const envelope: ExecutionInputEnvelope = {
    trigger: {
      type: triggerType,
      sourceId,
      source,
      idempotencyKey: input.idempotencyKey,
      workflowPublicId: input.workflowPublicId,
      workflowVersion: input.workflowVersion,
      acceptedAt: input.acceptedAt.toISOString(),
    },
    payload: input.payload,
    metadata,
  };

  return readExecutionInput(envelope);
}

export function readExecutionInput(input: unknown): ExecutionInputEnvelope {
  if (!isExecutionInputJsonObject(input)) {
    throw new DomainError({
      code: 'EXECUTION_INPUT_INVALID',
      category: 'validation',
      message: 'Execution input must be a JSON object',
    });
  }

  const encodedInputBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');

  if (encodedInputBytes > EXECUTION_INPUT_MAX_BYTES) {
    throw new DomainError({
      code: 'EXECUTION_INPUT_TOO_LARGE',
      category: 'validation',
      message: 'Execution input exceeds the maximum accepted size',
    });
  }

  const trigger = readExecutionTriggerReference(input.trigger);

  if (!isExecutionInputJsonObject(input.payload)) {
    throw invalidExecutionInput('Execution payload must be a JSON object');
  }

  if (!isExecutionInputJsonObject(input.metadata)) {
    throw invalidExecutionInput('Execution metadata must be a JSON object');
  }

  return {
    trigger,
    payload: input.payload,
    metadata: input.metadata,
  };
}

export function ensureExecutionStatusTransition(
  currentStatus: ExecutionStatus,
  nextStatus: ExecutionStatus,
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (EXECUTION_TERMINAL_STATUSES.has(currentStatus) && currentStatus !== 'dead_letter') {
    throw invalidExecutionTransition(currentStatus, nextStatus);
  }

  if (!EXECUTION_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw invalidExecutionTransition(currentStatus, nextStatus);
  }
}

export function executionNotFound(): DomainError {
  return new DomainError({
    code: 'EXECUTION_NOT_FOUND',
    category: 'not_found',
    message: 'Execution was not found',
  });
}

function readExecutionTriggerReference(value: unknown): ExecutionTriggerReference {
  if (!isExecutionInputJsonObject(value)) {
    throw invalidExecutionInput('Execution trigger must be a JSON object');
  }

  const type = readExecutionTriggerType(value.type);
  const sourceId = readBoundedString(
    value.sourceId,
    EXECUTION_SOURCE_ID_MAX_LENGTH,
    'Execution trigger source id is invalid',
  );
  const source = readBoundedString(
    value.source,
    EXECUTION_SOURCE_MAX_LENGTH,
    'Execution trigger source is invalid',
  );

  if (value.idempotencyKey !== null && typeof value.idempotencyKey !== 'string') {
    throw invalidExecutionInput('Execution trigger idempotency key is invalid');
  }

  if (typeof value.workflowPublicId !== 'string') {
    throw invalidExecutionInput('Execution trigger workflow public id is invalid');
  }

  const workflowVersion = value.workflowVersion;

  if (
    typeof workflowVersion !== 'number' ||
    !Number.isInteger(workflowVersion) ||
    workflowVersion < 1
  ) {
    throw invalidExecutionInput('Execution trigger workflow version is invalid');
  }

  if (typeof value.acceptedAt !== 'string' || Number.isNaN(Date.parse(value.acceptedAt))) {
    throw invalidExecutionInput('Execution trigger acceptedAt is invalid');
  }

  return {
    type,
    sourceId,
    source,
    idempotencyKey: value.idempotencyKey,
    workflowPublicId: value.workflowPublicId,
    workflowVersion,
    acceptedAt: value.acceptedAt,
  };
}

function readExecutionTriggerType(value: unknown): ExecutionTriggerType {
  if (value === 'webhook' || value === 'automation_bridge' || value === 'manual') {
    return value;
  }

  throw invalidExecutionInput('Execution trigger type is invalid');
}

function readBoundedString(value: unknown, maximumLength: number, message: string): string {
  if (typeof value !== 'string') {
    throw invalidExecutionInput(message);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > maximumLength) {
    throw invalidExecutionInput(message);
  }

  return normalizedValue;
}

function invalidExecutionTransition(
  currentStatus: ExecutionStatus,
  nextStatus: ExecutionStatus,
): DomainError {
  return new DomainError({
    code: 'EXECUTION_STATUS_TRANSITION_INVALID',
    category: 'conflict',
    message: `Execution cannot transition from ${currentStatus} to ${nextStatus}`,
  });
}

function invalidExecutionInput(message: string): DomainError {
  return new DomainError({
    code: 'EXECUTION_INPUT_INVALID',
    category: 'validation',
    message,
  });
}

function isExecutionInputJsonObject(value: unknown): value is ExecutionInputJsonObject {
  return isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item));
}

function isJsonValue(value: unknown): value is ExecutionInputJsonValue {
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

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
