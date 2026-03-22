import { DomainError } from '../shared';

export const AI_PROVIDER_ROLES = ['system', 'user', 'assistant'] as const;
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
export type AiStructuredSchemaType = (typeof AI_STRUCTURED_SCHEMA_TYPES)[number];
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };

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

const AI_PROVIDER_ROLE_SET = new Set<string>(AI_PROVIDER_ROLES);
const AI_STRUCTURED_SCHEMA_TYPE_SET = new Set<string>(AI_STRUCTURED_SCHEMA_TYPES);
const AI_MESSAGE_MAX_LENGTH = 24000;
const AI_MESSAGE_MAX_COUNT = 32;
const AI_SCHEMA_MAX_DEPTH = 8;
const AI_SCHEMA_MAX_PROPERTIES = 80;
const AI_SCHEMA_MAX_PROPERTY_NAME_LENGTH = 80;
const AI_SCHEMA_MAX_ENUM_VALUES = 128;
const AI_SCHEMA_MAX_ENUM_VALUE_LENGTH = 256;
const AI_SCHEMA_STRING_MAX_LENGTH_LIMIT = 64000;
const AI_SCHEMA_ARRAY_MAX_ITEMS_LIMIT = 1000;
const SAFE_SCHEMA_PROPERTY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function aiProviderConfigInvalid(message: string): DomainError {
  return new DomainError({
    code: 'AI_PROVIDER_CONFIG_INVALID',
    category: 'validation',
    message,
  });
}

export function aiProviderResponseInvalid(message: string): DomainError {
  return new DomainError({
    code: 'AI_PROVIDER_RESPONSE_INVALID',
    category: 'validation',
    message,
  });
}

export function readAiProviderMessages(value: unknown): readonly AiProviderMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > AI_MESSAGE_MAX_COUNT) {
    throw aiProviderConfigInvalid('AI provider messages must be a non-empty array');
  }

  return value.map((item) => readAiProviderMessage(item));
}

export function readAiStructuredObjectSchema(value: unknown): AiStructuredObjectSchema {
  const schema = readAiStructuredJsonSchema(value, 0);

  if (schema.type !== 'object') {
    throw aiProviderConfigInvalid(
      'AI provider structured response schema must be an object schema',
    );
  }

  return schema;
}

export function readAiStructuredJsonSchema(value: unknown, depth = 0): AiStructuredJsonSchema {
  if (depth > AI_SCHEMA_MAX_DEPTH) {
    throw aiProviderConfigInvalid('AI provider structured response schema is too deeply nested');
  }

  if (!isPlainObject(value)) {
    throw aiProviderConfigInvalid('AI provider structured response schema must be a JSON object');
  }

  const type = readSchemaType(value.type);

  if (type === 'object') {
    return readObjectSchema(value, depth);
  }

  if (type === 'array') {
    return readArraySchema(value, depth);
  }

  if (type === 'string') {
    return readStringSchema(value);
  }

  if (type === 'number' || type === 'integer') {
    return readNumberSchema(value, type);
  }

  if (type === 'boolean') {
    return { type };
  }

  return { type: 'null' };
}

export function validateAiStructuredResponse(
  value: unknown,
  schema: AiStructuredObjectSchema,
): JsonObject {
  const normalizedValue = validateValue(value, schema, '$');

  if (!isPlainObject(normalizedValue)) {
    throw aiProviderResponseInvalid('AI provider structured response must be a JSON object');
  }

  return normalizedValue as JsonObject;
}

function readAiProviderMessage(value: unknown): AiProviderMessage {
  if (!isPlainObject(value)) {
    throw aiProviderConfigInvalid('AI provider message must be a JSON object');
  }

  const role = readRole(value.role);
  const content = readContent(value.content);

  return { role, content };
}

function readRole(value: unknown): AiProviderRole {
  if (typeof value !== 'string') {
    throw aiProviderConfigInvalid('AI provider message role is required');
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!AI_PROVIDER_ROLE_SET.has(normalizedValue)) {
    throw aiProviderConfigInvalid('AI provider message role is invalid');
  }

  return normalizedValue as AiProviderRole;
}

function readContent(value: unknown): string {
  if (typeof value !== 'string') {
    throw aiProviderConfigInvalid('AI provider message content is required');
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > AI_MESSAGE_MAX_LENGTH) {
    throw aiProviderConfigInvalid('AI provider message content is invalid');
  }

  return normalizedValue;
}

function readSchemaType(value: unknown): AiStructuredJsonSchema['type'] {
  if (typeof value !== 'string') {
    throw aiProviderConfigInvalid('AI provider structured response schema type is required');
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!AI_STRUCTURED_SCHEMA_TYPE_SET.has(normalizedValue)) {
    throw aiProviderConfigInvalid('AI provider structured response schema type is invalid');
  }

  return normalizedValue as AiStructuredJsonSchema['type'];
}

function readObjectSchema(value: Record<string, unknown>, depth: number): AiStructuredObjectSchema {
  if (!isPlainObject(value.properties)) {
    throw aiProviderConfigInvalid('AI provider object schema properties must be a JSON object');
  }

  const propertyEntries = Object.entries(value.properties);

  if (propertyEntries.length === 0 || propertyEntries.length > AI_SCHEMA_MAX_PROPERTIES) {
    throw aiProviderConfigInvalid('AI provider object schema properties are invalid');
  }

  const properties = Object.fromEntries(
    propertyEntries.map(([key, item]) => {
      assertSafeSchemaPropertyName(key);
      return [key, readAiStructuredJsonSchema(item, depth + 1)];
    }),
  );
  const required = readRequiredList(value.required, properties);
  const additionalProperties = readOptionalBoolean(value.additionalProperties, false);

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(additionalProperties ? { additionalProperties } : {}),
  };
}

function readArraySchema(value: Record<string, unknown>, depth: number): AiStructuredArraySchema {
  const items = readAiStructuredJsonSchema(value.items, depth + 1);
  const minItems = readOptionalInteger(
    value.minItems,
    0,
    AI_SCHEMA_ARRAY_MAX_ITEMS_LIMIT,
    'minItems',
  );
  const maxItems = readOptionalInteger(
    value.maxItems,
    0,
    AI_SCHEMA_ARRAY_MAX_ITEMS_LIMIT,
    'maxItems',
  );

  if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
    throw aiProviderConfigInvalid(
      'AI provider array schema minItems must be less than or equal to maxItems',
    );
  }

  return {
    type: 'array',
    items,
    ...(minItems !== undefined ? { minItems } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
  };
}

function readStringSchema(value: Record<string, unknown>): AiStructuredStringSchema {
  const minLength = readOptionalInteger(
    value.minLength,
    0,
    AI_SCHEMA_STRING_MAX_LENGTH_LIMIT,
    'minLength',
  );
  const maxLength = readOptionalInteger(
    value.maxLength,
    0,
    AI_SCHEMA_STRING_MAX_LENGTH_LIMIT,
    'maxLength',
  );

  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    throw aiProviderConfigInvalid(
      'AI provider string schema minLength must be less than or equal to maxLength',
    );
  }

  const enumValues = readOptionalStringEnum(value.enum);

  return {
    type: 'string',
    ...(enumValues ? { enum: enumValues } : {}),
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
  };
}

function readNumberSchema(
  value: Record<string, unknown>,
  type: AiStructuredNumberSchema['type'],
): AiStructuredNumberSchema {
  const minimum = readOptionalFiniteNumber(value.minimum, 'minimum');
  const maximum = readOptionalFiniteNumber(value.maximum, 'maximum');

  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw aiProviderConfigInvalid(
      'AI provider number schema minimum must be less than or equal to maximum',
    );
  }

  return {
    type,
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
  };
}

function readRequiredList(
  value: unknown,
  properties: Readonly<Record<string, AiStructuredJsonSchema>>,
): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.length > Object.keys(properties).length) {
    throw aiProviderConfigInvalid('AI provider object schema required list is invalid');
  }

  const required = value.map((item) => {
    if (typeof item !== 'string') {
      throw aiProviderConfigInvalid('AI provider object schema required entries must be strings');
    }

    assertSafeSchemaPropertyName(item);

    if (!Object.prototype.hasOwnProperty.call(properties, item)) {
      throw aiProviderConfigInvalid(
        'AI provider object schema required entries must exist in properties',
      );
    }

    return item;
  });

  return Array.from(new Set(required));
}

function readOptionalStringEnum(value: unknown): readonly string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > AI_SCHEMA_MAX_ENUM_VALUES) {
    throw aiProviderConfigInvalid('AI provider string schema enum is invalid');
  }

  const values = value.map((item) => {
    if (
      typeof item !== 'string' ||
      item.length === 0 ||
      item.length > AI_SCHEMA_MAX_ENUM_VALUE_LENGTH
    ) {
      throw aiProviderConfigInvalid('AI provider string schema enum values are invalid');
    }

    return item;
  });

  return Array.from(new Set(values));
}

function readOptionalBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== 'boolean') {
    throw aiProviderConfigInvalid('AI provider schema boolean field is invalid');
  }

  return value;
}

function readOptionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fieldName: string,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw aiProviderConfigInvalid(`AI provider schema ${fieldName} is invalid`);
  }

  return value;
}

function readOptionalFiniteNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw aiProviderConfigInvalid(`AI provider schema ${fieldName} is invalid`);
  }

  return value;
}

function validateValue(value: unknown, schema: AiStructuredJsonSchema, path: string): JsonValue {
  if (schema.type === 'object') {
    return validateObject(value, schema, path);
  }

  if (schema.type === 'array') {
    return validateArray(value, schema, path);
  }

  if (schema.type === 'string') {
    return validateString(value, schema, path);
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return validateNumber(value, schema, path);
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw aiProviderResponseInvalid(`AI provider response field ${path} must be a boolean`);
    }

    return value;
  }

  if (value !== null) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} must be null`);
  }

  return null;
}

function validateObject(
  value: unknown,
  schema: AiStructuredObjectSchema,
  path: string,
): JsonObject {
  if (!isPlainObject(value)) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} must be an object`);
  }

  const output: Record<string, JsonValue> = {};
  const required = new Set(schema.required ?? []);

  for (const requiredKey of required) {
    if (!Object.prototype.hasOwnProperty.call(value, requiredKey)) {
      throw aiProviderResponseInvalid(
        `AI provider response field ${path}.${requiredKey} is required`,
      );
    }
  }

  for (const [key, item] of Object.entries(value)) {
    assertSafeSchemaPropertyName(key);
    const childSchema = schema.properties[key];

    if (!childSchema) {
      if (schema.additionalProperties === true) {
        output[key] = readJsonValue(item, `${path}.${key}`);
        continue;
      }

      throw aiProviderResponseInvalid(`AI provider response field ${path}.${key} is not allowed`);
    }

    output[key] = validateValue(item, childSchema, `${path}.${key}`);
  }

  return output;
}

function validateArray(
  value: unknown,
  schema: AiStructuredArraySchema,
  path: string,
): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} must be an array`);
  }

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} has too few items`);
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} has too many items`);
  }

  return value.map((item, index) => validateValue(item, schema.items, `${path}[${index}]`));
}

function validateString(value: unknown, schema: AiStructuredStringSchema, path: string): string {
  if (typeof value !== 'string') {
    throw aiProviderResponseInvalid(`AI provider response field ${path} must be a string`);
  }

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} is too short`);
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} is too long`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} is not an allowed value`);
  }

  return value;
}

function validateNumber(value: unknown, schema: AiStructuredNumberSchema, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} must be a number`);
  }

  if (schema.type === 'integer' && !Number.isInteger(value)) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} must be an integer`);
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} is below the minimum`);
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    throw aiProviderResponseInvalid(`AI provider response field ${path} exceeds the maximum`);
  }

  return value;
}

function readJsonValue(value: unknown, path: string): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw aiProviderResponseInvalid(`AI provider response field ${path} must be finite`);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => readJsonValue(item, `${path}[${index}]`));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        assertSafeSchemaPropertyName(key);
        return [key, readJsonValue(item, `${path}.${key}`)];
      }),
    );
  }

  throw aiProviderResponseInvalid(`AI provider response field ${path} must be JSON serializable`);
}

function assertSafeSchemaPropertyName(value: string): void {
  if (
    value.length === 0 ||
    value.length > AI_SCHEMA_MAX_PROPERTY_NAME_LENGTH ||
    UNSAFE_OBJECT_KEYS.has(value) ||
    !SAFE_SCHEMA_PROPERTY_NAME_PATTERN.test(value)
  ) {
    throw aiProviderConfigInvalid(
      'AI provider structured response schema contains an unsafe property name',
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
