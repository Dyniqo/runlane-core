import { DomainError } from '../shared';

export const USAGE_METRIC_TYPES = [
  'execution',
  'ai_call',
  'http_call',
  'webhook_request',
  'retry',
] as const;

export type UsageMetricType = (typeof USAGE_METRIC_TYPES)[number];

const USAGE_METRIC_TYPE_SET = new Set<string>(USAGE_METRIC_TYPES);
const USAGE_SOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_.:-]*$/;
const USAGE_SOURCE_ID_MAX_LENGTH = 160;
const USAGE_SOURCE_TYPE_MAX_LENGTH = 64;
const USAGE_QUANTITY_MAX = 1_000_000;

export function normalizeUsageMetricType(value: string): UsageMetricType {
  const normalizedValue = value.trim().toLowerCase();

  if (!USAGE_METRIC_TYPE_SET.has(normalizedValue)) {
    throw usageMetricInvalid('Usage metric type is invalid');
  }

  return normalizedValue as UsageMetricType;
}

export function normalizeUsageSourceType(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length === 0 ||
    normalizedValue.length > USAGE_SOURCE_TYPE_MAX_LENGTH ||
    !USAGE_SOURCE_TYPE_PATTERN.test(normalizedValue)
  ) {
    throw usageMetricInvalid('Usage source type is invalid');
  }

  return normalizedValue;
}

export function normalizeUsageSourceId(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > USAGE_SOURCE_ID_MAX_LENGTH) {
    throw usageMetricInvalid('Usage source id is invalid');
  }

  return normalizedValue;
}

export function normalizeUsageQuantity(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > USAGE_QUANTITY_MAX) {
    throw usageMetricInvalid('Usage quantity is invalid');
  }

  return value;
}

export function buildCurrentUsagePeriod(now: Date): { readonly start: Date; readonly end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  return { start, end };
}

export function usageMetricInvalid(message: string): DomainError {
  return new DomainError({
    code: 'USAGE_METRIC_INVALID',
    category: 'validation',
    message,
  });
}
