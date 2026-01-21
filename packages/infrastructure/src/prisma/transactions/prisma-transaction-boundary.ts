import { Inject, Injectable } from '@nestjs/common';
import type {
  TransactionBoundary,
  TransactionIsolationLevel,
  TransactionOptions,
} from '@runlane/application';
import type { PrismaTransactionClient } from '../prisma-persistence.context';
import { PrismaService } from '../prisma.service';
import { PrismaTransactionContext } from './prisma-transaction.context';

const DEFAULT_ACQUISITION_TIMEOUT_MS = 5000;
const MAX_ACQUISITION_TIMEOUT_MS = 30000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 15000;
const MAX_EXECUTION_TIMEOUT_MS = 120000;

const PRISMA_ISOLATION_LEVELS = {
  read_committed: 'ReadCommitted',
  repeatable_read: 'RepeatableRead',
  serializable: 'Serializable',
} as const satisfies Readonly<Record<TransactionIsolationLevel, PrismaIsolationLevel>>;

type PrismaIsolationLevel = 'ReadCommitted' | 'RepeatableRead' | 'Serializable';

interface PrismaInteractiveTransactionOptions {
  readonly isolationLevel: PrismaIsolationLevel;
  readonly maxWait: number;
  readonly timeout: number;
}

interface PrismaInteractiveTransactionClient {
  $transaction<Result>(
    operation: (client: PrismaTransactionClient) => Promise<Result>,
    options: PrismaInteractiveTransactionOptions,
  ): Promise<Result>;
}

@Injectable()
export class PrismaTransactionBoundary implements TransactionBoundary {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrismaTransactionContext) private readonly transactionContext: PrismaTransactionContext,
  ) {}

  execute<Result>(operation: () => Promise<Result>, options?: TransactionOptions): Promise<Result> {
    if (this.transactionContext.isActive) {
      assertNestedTransactionOptions(options);
      return operation();
    }

    const transactionClient = this.prisma as unknown as PrismaInteractiveTransactionClient;

    return transactionClient.$transaction(
      (client) => this.transactionContext.run(client, operation),
      mapTransactionOptions(options),
    );
  }
}

function mapTransactionOptions(options?: TransactionOptions): PrismaInteractiveTransactionOptions {
  const acquisitionTimeoutMs = readPositiveInteger(
    options?.acquisitionTimeoutMs,
    'Transaction acquisition timeout',
    DEFAULT_ACQUISITION_TIMEOUT_MS,
    MAX_ACQUISITION_TIMEOUT_MS,
  );
  const executionTimeoutMs = readPositiveInteger(
    options?.executionTimeoutMs,
    'Transaction execution timeout',
    DEFAULT_EXECUTION_TIMEOUT_MS,
    MAX_EXECUTION_TIMEOUT_MS,
  );
  const isolationLevel = options?.isolationLevel ?? 'read_committed';

  return {
    isolationLevel: PRISMA_ISOLATION_LEVELS[isolationLevel],
    maxWait: acquisitionTimeoutMs,
    timeout: executionTimeoutMs,
  };
}

function assertNestedTransactionOptions(options: TransactionOptions | undefined): void {
  if (options !== undefined && Object.keys(options).length > 0) {
    throw new Error('Nested transactions cannot override transaction options');
  }
}

function readPositiveInteger(
  value: number | undefined,
  name: string,
  defaultValue: number,
  maximumValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value <= 0 || value > maximumValue) {
    throw new TypeError(`${name} must be a positive integer not greater than ${maximumValue}`);
  }

  return value;
}
