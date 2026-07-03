import type { JsonRecord } from '../types';

export function titleCase(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDuration(value: number | null): string {
  if (typeof value !== 'number') return 'Pending';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function formatDate(value: string | null): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function compactId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function summarizeRecord(record: JsonRecord, limit = 6): readonly [string, string][] {
  const source = isJsonRecord(record.payload) ? record.payload : record;
  return flattenReadableFields(source)
    .slice(0, limit)
    .map(([key, value]) => [titleCase(key), String(value)] as const);
}

export function percentage(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function flattenReadableFields(record: JsonRecord): readonly [string, string | number | boolean][] {
  const fields: [string, string | number | boolean][] = [];
  const preferred = [
    'name',
    'email',
    'company',
    'title',
    'urgency',
    'score',
    'source',
    'requestId',
    'event',
    'externalId',
    'type',
    'companyDomain',
    'receivedAt',
  ];

  for (const key of preferred) {
    const value = record[key];
    if (isReadableScalar(value)) fields.push([key, value]);
  }

  for (const [key, value] of Object.entries(record)) {
    if (fields.some(([field]) => field === key)) continue;
    if (isReadableScalar(value)) fields.push([key, value]);
  }

  return fields;
}

function isReadableScalar(value: unknown): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
