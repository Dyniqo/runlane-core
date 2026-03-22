import type { JsonObject, JsonValue, MessageTrace } from '../shared';
import type { WorkspaceScope } from '../workspace';

export const AI_PROVIDER_ROLES = ['system', 'user', 'assistant'] as const;
export const AI_PROVIDER_FAILURE_CATEGORIES = [
  'configuration',
  'validation',
  'authentication',
  'authorization',
  'rate_limit',
  'timeout',
  'network',
  'remote',
  'unknown',
] as const;
export const AI_STRUCTURED_SCHEMA_TYPES = [
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
] as const;

export type AiProviderRole = (typeof AI_PROVIDER_ROLES)[number];
export type AiProviderFailureCategory = (typeof AI_PROVIDER_FAILURE_CATEGORIES)[number];
export type AiStructuredSchemaType = (typeof AI_STRUCTURED_SCHEMA_TYPES)[number];

export interface AiProviderMessage {
  readonly role: AiProviderRole;
  readonly content: string;
}

export interface AiStructuredObjectSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, AiStructuredJsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface AiStructuredArraySchema {
  readonly type: 'array';
  readonly items: AiStructuredJsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export interface AiStructuredStringSchema {
  readonly type: 'string';
  readonly enum?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface AiStructuredNumberSchema {
  readonly type: 'number' | 'integer';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface AiStructuredBooleanSchema {
  readonly type: 'boolean';
}

export interface AiStructuredNullSchema {
  readonly type: 'null';
}

export type AiStructuredJsonSchema =
  | AiStructuredArraySchema
  | AiStructuredBooleanSchema
  | AiStructuredNullSchema
  | AiStructuredNumberSchema
  | AiStructuredObjectSchema
  | AiStructuredStringSchema;

export interface AiProviderStructuredResponseRequest extends MessageTrace, WorkspaceScope {
  readonly workflowId: string;
  readonly executionId?: string;
  readonly stepKey?: string;
  readonly messages: readonly AiProviderMessage[];
  readonly schema: AiStructuredObjectSchema;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

export interface AiProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface AiProviderStructuredResponseSuccess {
  readonly status: 'succeeded';
  readonly model: string;
  readonly output: JsonObject;
  readonly rawText: string;
  readonly usage: AiProviderUsage;
}

export interface AiProviderStructuredResponseError {
  readonly code: string;
  readonly category: AiProviderFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: JsonObject;
}

export interface AiProviderStructuredResponseFailure {
  readonly status: 'failed';
  readonly error: AiProviderStructuredResponseError;
}

export type AiProviderStructuredResponseResult =
  | AiProviderStructuredResponseFailure
  | AiProviderStructuredResponseSuccess;

export interface AiProviderRawJsonObject extends JsonObject {
  readonly [key: string]: JsonValue;
}
