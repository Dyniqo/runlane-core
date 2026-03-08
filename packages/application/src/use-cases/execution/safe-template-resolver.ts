import type { JsonObject, JsonValue } from '@runlane/contracts';
import { DomainError } from '@runlane/domain';

export interface SafeTemplatePreviousStepOutput {
  readonly output: JsonObject;
}

export interface SafeTemplateResolverContext {
  readonly payload: JsonObject;
  readonly steps: Readonly<Record<string, SafeTemplatePreviousStepOutput>>;
}

export interface SafeTemplateSecretReference {
  readonly key: string;
  readonly path: string;
  readonly placeholder: string;
}

export interface SafeTemplateResolutionResult {
  readonly value: JsonObject;
  readonly secretReferences: readonly SafeTemplateSecretReference[];
}

interface MutableTemplateResolutionState {
  readonly secretReferences: SafeTemplateSecretReference[];
}

interface ResolvedExpression {
  readonly value: JsonValue;
  readonly secretReference?: SafeTemplateSecretReference;
}

const TEMPLATE_TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const EXACT_TEMPLATE_TOKEN_PATTERN = /^{{\s*([^{}]+?)\s*}}$/;
const TEMPLATE_EXPRESSION_MAX_LENGTH = 240;
const TEMPLATE_STRING_MAX_TOKENS = 40;
const TEMPLATE_OBJECT_MAX_DEPTH = 16;
const TEMPLATE_ARRAY_MAX_ITEMS = 200;
const TEMPLATE_OBJECT_MAX_KEYS = 200;
const SECRET_REFERENCE_OBJECT_KEY = '__runlaneSecretRef';
const SAFE_SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/i;
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_:-]{1,80}$/;
const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export class SafeTemplateResolver {
  resolveObject(
    input: JsonObject,
    context: SafeTemplateResolverContext,
  ): SafeTemplateResolutionResult {
    const state: MutableTemplateResolutionState = { secretReferences: [] };
    const resolved = this.resolveValue(input, context, state, '$', 0);

    if (!isJsonObject(resolved) || Array.isArray(resolved)) {
      throw templateResolutionError(
        'TEMPLATE_DOCUMENT_INVALID',
        'Template resolver output must be a JSON object',
      );
    }

    return {
      value: resolved,
      secretReferences: state.secretReferences,
    };
  }

  private resolveValue(
    value: JsonValue,
    context: SafeTemplateResolverContext,
    state: MutableTemplateResolutionState,
    path: string,
    depth: number,
  ): JsonValue {
    if (depth > TEMPLATE_OBJECT_MAX_DEPTH) {
      throw templateResolutionError(
        'TEMPLATE_DEPTH_EXCEEDED',
        'Template input is too deeply nested',
      );
    }

    if (typeof value === 'string') {
      return this.resolveString(value, context, state, path);
    }

    if (Array.isArray(value)) {
      if (value.length > TEMPLATE_ARRAY_MAX_ITEMS) {
        throw templateResolutionError(
          'TEMPLATE_ARRAY_TOO_LARGE',
          'Template array has too many items',
        );
      }

      return value.map((item, index) =>
        this.resolveValue(item, context, state, `${path}[${index}]`, depth + 1),
      );
    }

    if (isJsonObject(value)) {
      const entries = Object.entries(value);

      if (entries.length > TEMPLATE_OBJECT_MAX_KEYS) {
        throw templateResolutionError(
          'TEMPLATE_OBJECT_TOO_LARGE',
          'Template object has too many keys',
        );
      }

      return Object.fromEntries(
        entries.map(([key, nestedValue]) => {
          assertSafeObjectKey(key);
          return [key, this.resolveValue(nestedValue, context, state, `${path}.${key}`, depth + 1)];
        }),
      );
    }

    return value;
  }

  private resolveString(
    value: string,
    context: SafeTemplateResolverContext,
    state: MutableTemplateResolutionState,
    path: string,
  ): JsonValue {
    const exactMatch = value.match(EXACT_TEMPLATE_TOKEN_PATTERN);

    if (exactMatch && exactMatch[1]) {
      const resolved = resolveExpression(exactMatch[1], context, path, exactMatch[0] ?? value);

      if (resolved.secretReference) {
        state.secretReferences.push(resolved.secretReference);
      }

      return resolved.value;
    }

    const matches = [...value.matchAll(TEMPLATE_TOKEN_PATTERN)];

    if (matches.length === 0) {
      return value;
    }

    if (matches.length > TEMPLATE_STRING_MAX_TOKENS) {
      throw templateResolutionError(
        'TEMPLATE_TOKEN_LIMIT_EXCEEDED',
        'Template string contains too many expressions',
      );
    }

    let output = value;

    for (const match of matches) {
      const expression = match[1];
      const placeholder = match[0];

      if (!expression || !placeholder) {
        throw templateResolutionError(
          'TEMPLATE_EXPRESSION_INVALID',
          'Template expression is invalid',
        );
      }

      const resolved = resolveExpression(expression, context, path, placeholder);

      if (resolved.secretReference) {
        throw templateResolutionError(
          'TEMPLATE_SECRET_INTERPOLATION_UNSAFE',
          'Secret references must occupy the full template value',
        );
      }

      if (!isScalarTemplateValue(resolved.value)) {
        throw templateResolutionError(
          'TEMPLATE_INTERPOLATION_VALUE_INVALID',
          'Only scalar values can be interpolated inside strings',
        );
      }

      output = output.split(placeholder).join(String(resolved.value));
    }

    return output;
  }
}

export function isSecretReferenceValue(value: JsonValue): value is JsonObject {
  return (
    isJsonObject(value) &&
    !Array.isArray(value) &&
    typeof value[SECRET_REFERENCE_OBJECT_KEY] === 'string'
  );
}

function resolveExpression(
  expression: string,
  context: SafeTemplateResolverContext,
  path: string,
  placeholder: string,
): ResolvedExpression {
  const normalizedExpression = expression.trim();

  if (
    normalizedExpression.length === 0 ||
    normalizedExpression.length > TEMPLATE_EXPRESSION_MAX_LENGTH
  ) {
    throw templateResolutionError('TEMPLATE_EXPRESSION_INVALID', 'Template expression is invalid');
  }

  const segments = normalizedExpression.split('.');

  for (const segment of segments) {
    assertSafePathSegment(segment);
  }

  const scope = segments[0];

  if (scope === 'payload') {
    return { value: readPathValue(context.payload, segments.slice(1), normalizedExpression) };
  }

  if (scope === 'steps' || scope === 'previousSteps') {
    return { value: readPreviousStepValue(context.steps, segments.slice(1), normalizedExpression) };
  }

  if (scope === 'secrets') {
    const secretKey = readSecretReferenceKey(segments.slice(1));

    return {
      value: buildSecretReference(secretKey),
      secretReference: {
        key: secretKey,
        path,
        placeholder,
      },
    };
  }

  throw templateResolutionError(
    'TEMPLATE_EXPRESSION_INVALID',
    'Template expression scope is invalid',
  );
}

function readPreviousStepValue(
  steps: Readonly<Record<string, SafeTemplatePreviousStepOutput>>,
  segments: readonly string[],
  expression: string,
): JsonValue {
  if (segments.length < 2 || segments[1] !== 'output') {
    throw templateResolutionError(
      'TEMPLATE_PREVIOUS_OUTPUT_PATH_INVALID',
      'Previous step references must use steps.<stepKey>.output',
    );
  }

  const stepKey = segments[0];

  if (!stepKey) {
    throw templateResolutionError(
      'TEMPLATE_PREVIOUS_OUTPUT_PATH_INVALID',
      'Previous step references must include a step key',
    );
  }

  const step = steps[stepKey];

  if (!step) {
    throw templateResolutionError(
      'TEMPLATE_PREVIOUS_OUTPUT_MISSING',
      `Template expression '${expression}' references an unavailable previous step`,
    );
  }

  return readPathValue(step.output, segments.slice(2), expression);
}

function readPathValue(
  source: JsonValue,
  segments: readonly string[],
  expression: string,
): JsonValue {
  let current: JsonValue = source;

  for (const segment of segments) {
    if (!isJsonObject(current) || Array.isArray(current) || !(segment in current)) {
      throw templateResolutionError(
        'TEMPLATE_VALUE_MISSING',
        `Template expression '${expression}' could not be resolved`,
      );
    }

    const nextValue = current[segment];

    if (nextValue === undefined) {
      throw templateResolutionError(
        'TEMPLATE_VALUE_MISSING',
        `Template expression '${expression}' could not be resolved`,
      );
    }

    current = nextValue;
  }

  return current;
}

function readSecretReferenceKey(segments: readonly string[]): string {
  const secretKey = segments[0];

  if (segments.length !== 1 || !secretKey || !SAFE_SECRET_KEY_PATTERN.test(secretKey)) {
    throw templateResolutionError(
      'TEMPLATE_SECRET_REFERENCE_INVALID',
      'Secret references must use secrets.<key>',
    );
  }

  return secretKey;
}

function buildSecretReference(secretKey: string): JsonObject {
  return {
    [SECRET_REFERENCE_OBJECT_KEY]: secretKey,
    source: 'workflow_secret',
    required: true,
  };
}

function assertSafePathSegment(segment: string): void {
  if (!SAFE_PATH_SEGMENT_PATTERN.test(segment) || UNSAFE_PATH_SEGMENTS.has(segment)) {
    throw templateResolutionError('TEMPLATE_PATH_INVALID', 'Template expression path is invalid');
  }
}

function assertSafeObjectKey(key: string): void {
  if (UNSAFE_PATH_SEGMENTS.has(key)) {
    throw templateResolutionError('TEMPLATE_OBJECT_KEY_INVALID', 'Template object key is invalid');
  }
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function isScalarTemplateValue(value: JsonValue): value is boolean | number | string {
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';
}

function templateResolutionError(code: string, message: string): DomainError {
  return new DomainError({
    code,
    category: 'validation',
    message,
  });
}
