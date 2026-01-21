export const TRANSACTION_BOUNDARY = Symbol('TRANSACTION_BOUNDARY');

export const TRANSACTION_ISOLATION_LEVELS = [
  'read_committed',
  'repeatable_read',
  'serializable',
] as const;

export type TransactionIsolationLevel = (typeof TRANSACTION_ISOLATION_LEVELS)[number];

export interface TransactionOptions {
  readonly acquisitionTimeoutMs?: number;
  readonly executionTimeoutMs?: number;
  readonly isolationLevel?: TransactionIsolationLevel;
}

export interface TransactionBoundary {
  execute<Result>(operation: () => Promise<Result>, options?: TransactionOptions): Promise<Result>;
}
