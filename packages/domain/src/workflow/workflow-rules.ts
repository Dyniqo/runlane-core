import { DomainError } from '../shared';

export const WORKFLOW_STATUSES = ['draft', 'published', 'archived'] as const;
export const DEFAULT_WORKFLOW_TRIGGER_TYPE = 'webhook';

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type WorkflowDefinitionJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly WorkflowDefinitionJsonValue[]
  | WorkflowDefinitionValue;
export interface WorkflowDefinitionValue {
  readonly [key: string]: WorkflowDefinitionJsonValue;
}

const WORKFLOW_NAME_MIN_LENGTH = 2;
const WORKFLOW_NAME_MAX_LENGTH = 140;
const WORKFLOW_TRIGGER_TYPE_MIN_LENGTH = 2;
const WORKFLOW_TRIGGER_TYPE_MAX_LENGTH = 64;
const WORKFLOW_DEFINITION_MAX_BYTES = 128 * 1024;
const WORKFLOW_TRIGGER_TYPE_PATTERN = /^[a-z][a-z0-9._:-]*$/;

export function normalizeWorkflowName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, ' ');

  if (
    normalizedName.length < WORKFLOW_NAME_MIN_LENGTH ||
    normalizedName.length > WORKFLOW_NAME_MAX_LENGTH
  ) {
    throw new DomainError({
      code: 'WORKFLOW_NAME_INVALID',
      category: 'validation',
      message: `Workflow name must be between ${WORKFLOW_NAME_MIN_LENGTH} and ${WORKFLOW_NAME_MAX_LENGTH} characters`,
    });
  }

  return normalizedName;
}

export function normalizeWorkflowTriggerType(triggerType: string | null | undefined): string {
  const normalizedTriggerType = (triggerType ?? DEFAULT_WORKFLOW_TRIGGER_TYPE).trim().toLowerCase();

  if (
    normalizedTriggerType.length < WORKFLOW_TRIGGER_TYPE_MIN_LENGTH ||
    normalizedTriggerType.length > WORKFLOW_TRIGGER_TYPE_MAX_LENGTH ||
    !WORKFLOW_TRIGGER_TYPE_PATTERN.test(normalizedTriggerType)
  ) {
    throw new DomainError({
      code: 'WORKFLOW_TRIGGER_TYPE_INVALID',
      category: 'validation',
      message: 'Workflow trigger type is invalid',
    });
  }

  return normalizedTriggerType;
}

export function readWorkflowDefinition(definition: unknown): WorkflowDefinitionValue {
  if (definition === undefined || definition === null) {
    return {};
  }

  if (!isWorkflowDefinitionObject(definition)) {
    throw new DomainError({
      code: 'WORKFLOW_DEFINITION_INVALID',
      category: 'validation',
      message: 'Workflow definition must be a JSON object',
    });
  }

  const encodedDefinition = Buffer.byteLength(JSON.stringify(definition), 'utf8');

  if (encodedDefinition > WORKFLOW_DEFINITION_MAX_BYTES) {
    throw new DomainError({
      code: 'WORKFLOW_DEFINITION_TOO_LARGE',
      category: 'validation',
      message: 'Workflow definition exceeds the maximum payload size',
    });
  }

  return definition;
}

function isWorkflowDefinitionObject(value: unknown): value is WorkflowDefinitionValue {
  return isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item));
}

function isJsonValue(value: unknown): value is WorkflowDefinitionJsonValue {
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
