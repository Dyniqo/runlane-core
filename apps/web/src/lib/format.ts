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
  return Object.entries(record)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, limit)
    .map(([key, value]) => [titleCase(key), String(value)] as const);
}

export function percentage(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}
