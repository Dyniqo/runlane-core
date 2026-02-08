import { randomBytes } from 'node:crypto';

import { DomainError } from '../shared';

export const WORKFLOW_SCHEMA_VERSION = 1 as const;
export const WORKFLOW_STATUSES = ['draft', 'published', 'archived'] as const;
export const WORKFLOW_TRIGGER_TYPES = ['webhook', 'automation', 'manual'] as const;
export const WORKFLOW_STEP_TYPES = ['http', 'ai_decision', 'notification', 'condition'] as const;
export const DEFAULT_WORKFLOW_TRIGGER_TYPE = 'webhook';
export const WORKFLOW_PUBLIC_ID_PREFIX = 'wf';

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];
export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];
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

export interface WorkflowTriggerDefinitionValue extends WorkflowDefinitionValue {
  readonly type: WorkflowTriggerType;
  readonly config: WorkflowDefinitionValue;
}

export interface WorkflowStepTransitionsValue extends WorkflowDefinitionValue {
  readonly onSuccess?: string;
  readonly onFailure?: string;
  readonly branches?: Readonly<Record<string, string>>;
}

export interface WorkflowStepDefinitionValue extends WorkflowDefinitionValue {
  readonly key: string;
  readonly name: string;
  readonly type: WorkflowStepType;
  readonly config: WorkflowDefinitionValue;
  readonly timeoutMs?: number;
  readonly transitions?: WorkflowStepTransitionsValue;
}

export interface WorkflowDefinition extends WorkflowDefinitionValue {
  readonly schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  readonly trigger: WorkflowTriggerDefinitionValue;
  readonly entryStepKey: string;
  readonly steps: readonly WorkflowStepDefinitionValue[];
}

export interface ReadWorkflowDefinitionOptions {
  readonly triggerType?: string | null;
}

const WORKFLOW_PUBLIC_ID_RANDOM_BYTES = 16;
const WORKFLOW_PUBLIC_ID_PATTERN = /^wf_[a-f0-9]{32}$/;
const WORKFLOW_NAME_MIN_LENGTH = 2;
const WORKFLOW_NAME_MAX_LENGTH = 140;
const WORKFLOW_TRIGGER_TYPE_MIN_LENGTH = 2;
const WORKFLOW_TRIGGER_TYPE_MAX_LENGTH = 64;
const WORKFLOW_DEFINITION_MAX_BYTES = 128 * 1024;
const WORKFLOW_STEP_LIMIT = 50;
const WORKFLOW_STEP_KEY_MIN_LENGTH = 1;
const WORKFLOW_STEP_KEY_MAX_LENGTH = 80;
const WORKFLOW_STEP_NAME_MIN_LENGTH = 1;
const WORKFLOW_STEP_NAME_MAX_LENGTH = 120;
const WORKFLOW_BRANCH_KEY_MAX_LENGTH = 80;
const WORKFLOW_STEP_TIMEOUT_MIN_MS = 100;
const WORKFLOW_STEP_TIMEOUT_MAX_MS = 300_000;
const WORKFLOW_TRIGGER_TYPE_PATTERN = /^[a-z][a-z0-9._:-]*$/;
const WORKFLOW_STEP_KEY_PATTERN = /^[a-z][a-z0-9_:-]*$/;
const WORKFLOW_BRANCH_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,80}$/;
const WORKFLOW_TRIGGER_TYPE_SET = new Set<string>(WORKFLOW_TRIGGER_TYPES);
const WORKFLOW_STEP_TYPE_SET = new Set<string>(WORKFLOW_STEP_TYPES);

export function createWorkflowPublicId(): string {
  return `${WORKFLOW_PUBLIC_ID_PREFIX}_${randomBytes(WORKFLOW_PUBLIC_ID_RANDOM_BYTES).toString('hex')}`;
}

export function normalizeWorkflowPublicId(publicId: string): string {
  const normalizedPublicId = publicId.trim().toLowerCase();

  if (!WORKFLOW_PUBLIC_ID_PATTERN.test(normalizedPublicId)) {
    throw new DomainError({
      code: 'WORKFLOW_PUBLIC_ID_INVALID',
      category: 'validation',
      message: 'Workflow public id is invalid',
    });
  }

  return normalizedPublicId;
}

export function readWorkflowTestPayload(payload: unknown): WorkflowDefinitionValue {
  if (payload === undefined || payload === null) {
    return {};
  }

  if (!isWorkflowDefinitionObject(payload)) {
    throw new DomainError({
      code: 'WORKFLOW_TEST_PAYLOAD_INVALID',
      category: 'validation',
      message: 'Workflow test payload must be a JSON object',
    });
  }

  return payload;
}

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
    !WORKFLOW_TRIGGER_TYPE_PATTERN.test(normalizedTriggerType) ||
    !WORKFLOW_TRIGGER_TYPE_SET.has(normalizedTriggerType)
  ) {
    throw new DomainError({
      code: 'WORKFLOW_TRIGGER_TYPE_INVALID',
      category: 'validation',
      message: 'Workflow trigger type is invalid',
    });
  }

  return normalizedTriggerType;
}

export function readWorkflowDefinition(
  definition: unknown,
  options: ReadWorkflowDefinitionOptions = {},
): WorkflowDefinition {
  if (definition === undefined || definition === null) {
    return buildDefaultWorkflowDefinition(normalizeWorkflowTriggerType(options.triggerType));
  }

  if (!isWorkflowDefinitionObject(definition)) {
    throw invalidWorkflowDefinition('Workflow definition must be a JSON object');
  }

  const encodedDefinition = Buffer.byteLength(JSON.stringify(definition), 'utf8');

  if (encodedDefinition > WORKFLOW_DEFINITION_MAX_BYTES) {
    throw new DomainError({
      code: 'WORKFLOW_DEFINITION_TOO_LARGE',
      category: 'validation',
      message: 'Workflow definition exceeds the maximum payload size',
    });
  }

  const normalizedDefinition = normalizeWorkflowDefinition(definition);
  const expectedTriggerType =
    options.triggerType === undefined || options.triggerType === null
      ? null
      : normalizeWorkflowTriggerType(options.triggerType);

  if (expectedTriggerType && normalizedDefinition.trigger.type !== expectedTriggerType) {
    throw invalidWorkflowDefinition('Workflow definition trigger type does not match triggerType');
  }

  return normalizedDefinition;
}

export function getWorkflowDefinitionTriggerType(
  definition: WorkflowDefinition,
): WorkflowTriggerType {
  return definition.trigger.type;
}

export function retargetWorkflowDefinitionTriggerType(
  definition: unknown,
  triggerType: string,
): WorkflowDefinition {
  const normalizedDefinition = readWorkflowDefinition(definition);
  const normalizedTriggerType = normalizeWorkflowTriggerType(triggerType) as WorkflowTriggerType;

  return {
    ...normalizedDefinition,
    trigger: {
      ...normalizedDefinition.trigger,
      type: normalizedTriggerType,
    },
  };
}

export function ensureWorkflowCanBeUpdated(status: WorkflowStatus): void {
  if (status !== 'draft') {
    throw new DomainError({
      code: 'WORKFLOW_NOT_EDITABLE',
      category: 'conflict',
      message: 'Only draft workflows can be updated',
    });
  }
}

export function ensureWorkflowCanBePublished(status: WorkflowStatus): void {
  if (status === 'archived') {
    throw new DomainError({
      code: 'WORKFLOW_NOT_PUBLISHABLE',
      category: 'conflict',
      message: 'Archived workflows cannot be published',
    });
  }
}

function buildDefaultWorkflowDefinition(triggerType: string): WorkflowDefinition {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    trigger: {
      type: normalizeWorkflowTriggerType(triggerType) as WorkflowTriggerType,
      config: {},
    },
    entryStepKey: 'start',
    steps: [
      {
        key: 'start',
        name: 'Start',
        type: 'condition',
        config: {},
      },
    ],
  };
}

function normalizeWorkflowDefinition(definition: WorkflowDefinitionValue): WorkflowDefinition {
  if (definition.schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    throw invalidWorkflowDefinition(`Workflow schemaVersion must be ${WORKFLOW_SCHEMA_VERSION}`);
  }

  const trigger = normalizeTriggerDefinition(definition.trigger);
  const entryStepKey = normalizeStepKey(
    definition.entryStepKey,
    'Workflow entryStepKey is invalid',
  );
  const steps = normalizeWorkflowSteps(definition.steps);
  const stepKeys = new Set(steps.map((step) => step.key));

  if (!stepKeys.has(entryStepKey)) {
    throw invalidWorkflowDefinition('Workflow entryStepKey must reference an existing step');
  }

  for (const step of steps) {
    validateStepTransitions(step, stepKeys);
  }

  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    trigger,
    entryStepKey,
    steps,
  };
}

function normalizeTriggerDefinition(value: unknown): WorkflowTriggerDefinitionValue {
  if (!isPlainObject(value)) {
    throw invalidWorkflowDefinition('Workflow trigger must be an object');
  }

  if (typeof value.type !== 'string') {
    throw invalidWorkflowDefinition('Workflow trigger type is required');
  }

  const type = normalizeWorkflowTriggerType(value.type) as WorkflowTriggerType;

  if (!isWorkflowDefinitionObject(value.config)) {
    throw invalidWorkflowDefinition('Workflow trigger config must be a JSON object');
  }

  return {
    type,
    config: value.config,
  };
}

function normalizeWorkflowSteps(value: unknown): readonly WorkflowStepDefinitionValue[] {
  if (!Array.isArray(value)) {
    throw invalidWorkflowDefinition('Workflow steps must be an array');
  }

  if (value.length < 1 || value.length > WORKFLOW_STEP_LIMIT) {
    throw invalidWorkflowDefinition(
      `Workflow must define between 1 and ${WORKFLOW_STEP_LIMIT} steps`,
    );
  }

  const stepKeys = new Set<string>();

  return value.map((step, index) => {
    const normalizedStep = normalizeWorkflowStep(step, index);

    if (stepKeys.has(normalizedStep.key)) {
      throw invalidWorkflowDefinition(`Workflow step key '${normalizedStep.key}' is duplicated`);
    }

    stepKeys.add(normalizedStep.key);

    return normalizedStep;
  });
}

function normalizeWorkflowStep(value: unknown, index: number): WorkflowStepDefinitionValue {
  if (!isPlainObject(value)) {
    throw invalidWorkflowDefinition(`Workflow step at index ${index} must be an object`);
  }

  const key = normalizeStepKey(value.key, `Workflow step at index ${index} has an invalid key`);
  const name = normalizeStepName(value.name, index);
  const type = normalizeStepType(value.type, index);
  const timeoutMs = normalizeStepTimeout(value.timeoutMs, index);
  const transitions = normalizeStepTransitions(value.transitions, index);

  if (!isWorkflowDefinitionObject(value.config)) {
    throw invalidWorkflowDefinition(`Workflow step '${key}' config must be a JSON object`);
  }

  return {
    key,
    name,
    type,
    config: value.config,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(transitions !== undefined ? { transitions } : {}),
  };
}

function normalizeStepKey(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw invalidWorkflowDefinition(message);
  }

  const normalizedKey = value.trim();

  if (
    normalizedKey.length < WORKFLOW_STEP_KEY_MIN_LENGTH ||
    normalizedKey.length > WORKFLOW_STEP_KEY_MAX_LENGTH ||
    !WORKFLOW_STEP_KEY_PATTERN.test(normalizedKey)
  ) {
    throw invalidWorkflowDefinition(message);
  }

  return normalizedKey;
}

function normalizeStepName(value: unknown, index: number): string {
  if (typeof value !== 'string') {
    throw invalidWorkflowDefinition(`Workflow step at index ${index} name is required`);
  }

  const normalizedName = value.trim().replace(/\s+/g, ' ');

  if (
    normalizedName.length < WORKFLOW_STEP_NAME_MIN_LENGTH ||
    normalizedName.length > WORKFLOW_STEP_NAME_MAX_LENGTH
  ) {
    throw invalidWorkflowDefinition(`Workflow step at index ${index} name is invalid`);
  }

  return normalizedName;
}

function normalizeStepType(value: unknown, index: number): WorkflowStepType {
  if (typeof value !== 'string') {
    throw invalidWorkflowDefinition(`Workflow step at index ${index} type is required`);
  }

  const normalizedType = value.trim().toLowerCase();

  if (!WORKFLOW_STEP_TYPE_SET.has(normalizedType)) {
    throw invalidWorkflowDefinition(`Workflow step at index ${index} type is invalid`);
  }

  return normalizedType as WorkflowStepType;
}

function normalizeStepTimeout(value: unknown, index: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < WORKFLOW_STEP_TIMEOUT_MIN_MS ||
    value > WORKFLOW_STEP_TIMEOUT_MAX_MS
  ) {
    throw invalidWorkflowDefinition(`Workflow step at index ${index} timeoutMs is invalid`);
  }

  return value;
}

function normalizeStepTransitions(
  value: unknown,
  index: number,
): WorkflowStepTransitionsValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw invalidWorkflowDefinition(
      `Workflow step at index ${index} transitions must be an object`,
    );
  }

  const onSuccess = normalizeOptionalTransitionTarget(value.onSuccess, index, 'onSuccess');
  const onFailure = normalizeOptionalTransitionTarget(value.onFailure, index, 'onFailure');
  const branches = normalizeBranches(value.branches, index);

  return {
    ...(onSuccess !== undefined ? { onSuccess } : {}),
    ...(onFailure !== undefined ? { onFailure } : {}),
    ...(branches !== undefined ? { branches } : {}),
  };
}

function normalizeOptionalTransitionTarget(
  value: unknown,
  index: number,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeStepKey(value, `Workflow step at index ${index} transition ${field} is invalid`);
}

function normalizeBranches(
  value: unknown,
  index: number,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw invalidWorkflowDefinition(`Workflow step at index ${index} branches must be an object`);
  }

  return Object.entries(value).reduce<Record<string, string>>((branches, [branchKey, target]) => {
    if (
      branchKey.length > WORKFLOW_BRANCH_KEY_MAX_LENGTH ||
      !WORKFLOW_BRANCH_KEY_PATTERN.test(branchKey)
    ) {
      throw invalidWorkflowDefinition(`Workflow step at index ${index} branch key is invalid`);
    }

    branches[branchKey] = normalizeStepKey(
      target,
      `Workflow step at index ${index} branch '${branchKey}' target is invalid`,
    );

    return branches;
  }, {});
}

function validateStepTransitions(
  step: WorkflowStepDefinitionValue,
  stepKeys: ReadonlySet<string>,
): void {
  const transitions = step.transitions;

  if (!transitions) {
    return;
  }

  if (transitions.onSuccess && !stepKeys.has(transitions.onSuccess)) {
    throw invalidWorkflowDefinition(`Workflow step '${step.key}' onSuccess transition is unknown`);
  }

  if (transitions.onFailure && !stepKeys.has(transitions.onFailure)) {
    throw invalidWorkflowDefinition(`Workflow step '${step.key}' onFailure transition is unknown`);
  }

  for (const [branch, target] of Object.entries(transitions.branches ?? {})) {
    if (!stepKeys.has(target)) {
      throw invalidWorkflowDefinition(
        `Workflow step '${step.key}' branch '${branch}' transition is unknown`,
      );
    }
  }
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

function invalidWorkflowDefinition(message: string): DomainError {
  return new DomainError({
    code: 'WORKFLOW_DEFINITION_INVALID',
    category: 'validation',
    message,
  });
}
