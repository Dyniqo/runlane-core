import { DomainError } from '../shared';
import type { AiProviderMessage, AiStructuredObjectSchema } from './ai-provider-rules';
import { readAiProviderMessages, readAiStructuredObjectSchema } from './ai-provider-rules';

export interface AiDecisionStepConfig {
  readonly messages: readonly AiProviderMessage[];
  readonly schema: AiStructuredObjectSchema;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly branchPath: string;
}

const DEFAULT_AI_DECISION_BRANCH_PATH = 'branch';
const AI_DECISION_MODEL_MAX_LENGTH = 160;
const AI_DECISION_BRANCH_PATH_PATTERN = /^[A-Za-z0-9_:-]+(?:\.[A-Za-z0-9_:-]+){0,24}$/;
const AI_DECISION_MAX_OUTPUT_TOKENS_MIN = 16;
const AI_DECISION_MAX_OUTPUT_TOKENS_MAX = 8192;
const AI_DECISION_TEMPERATURE_MIN = 0;
const AI_DECISION_TEMPERATURE_MAX = 2;

export function readAiDecisionStepConfig(input: unknown): AiDecisionStepConfig {
  if (!isPlainObject(input)) {
    throw aiDecisionStepConfigInvalid('AI decision step config must be a JSON object');
  }

  return {
    messages: readAiProviderMessages(input.messages),
    schema: readAiStructuredObjectSchema(input.schema),
    ...(input.model !== undefined ? { model: readOptionalModel(input.model) } : {}),
    ...(input.temperature !== undefined
      ? { temperature: readOptionalTemperature(input.temperature) }
      : {}),
    ...(input.maxOutputTokens !== undefined
      ? { maxOutputTokens: readOptionalMaxOutputTokens(input.maxOutputTokens) }
      : {}),
    branchPath: readOptionalBranchPath(input.branchPath),
  };
}

export function aiDecisionStepConfigInvalid(message: string): DomainError {
  return new DomainError({
    code: 'AI_DECISION_STEP_CONFIG_INVALID',
    category: 'validation',
    message,
  });
}

function readOptionalModel(value: unknown): string {
  if (typeof value !== 'string') {
    throw aiDecisionStepConfigInvalid('AI decision model must be a string');
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > AI_DECISION_MODEL_MAX_LENGTH) {
    throw aiDecisionStepConfigInvalid('AI decision model is invalid');
  }

  return normalizedValue;
}

function readOptionalTemperature(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < AI_DECISION_TEMPERATURE_MIN ||
    value > AI_DECISION_TEMPERATURE_MAX
  ) {
    throw aiDecisionStepConfigInvalid('AI decision temperature is invalid');
  }

  return value;
}

function readOptionalMaxOutputTokens(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < AI_DECISION_MAX_OUTPUT_TOKENS_MIN ||
    value > AI_DECISION_MAX_OUTPUT_TOKENS_MAX
  ) {
    throw aiDecisionStepConfigInvalid('AI decision maxOutputTokens is invalid');
  }

  return value;
}

function readOptionalBranchPath(value: unknown): string {
  if (value === undefined || value === null) {
    return DEFAULT_AI_DECISION_BRANCH_PATH;
  }

  if (typeof value !== 'string') {
    throw aiDecisionStepConfigInvalid('AI decision branchPath must be a string');
  }

  const normalizedValue = value.trim();

  if (!AI_DECISION_BRANCH_PATH_PATTERN.test(normalizedValue)) {
    throw aiDecisionStepConfigInvalid('AI decision branchPath is invalid');
  }

  return normalizedValue;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
