import type { JsonObject } from '@runlane/contracts';
import type { UsageMetricType } from '@runlane/domain';

export const USAGE_RECORD_REPOSITORY = Symbol('USAGE_RECORD_REPOSITORY');

export interface CreateUsageRecordInput {
  readonly workspaceId: string;
  readonly type: UsageMetricType;
  readonly quantity: number;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
}

export interface CreateUsageRecordsInput {
  readonly records: readonly CreateUsageRecordInput[];
}

export interface GetUsageSummaryInput {
  readonly workspaceId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

export interface UsageMetricQuantityRecord {
  readonly type: UsageMetricType;
  readonly quantity: number;
}

export interface UsageRecordRepositoryPort {
  record(input: CreateUsageRecordInput): Promise<void>;
  recordMany(input: CreateUsageRecordsInput): Promise<void>;
  summarizeCurrentPeriod(
    input: GetUsageSummaryInput,
  ): Promise<readonly UsageMetricQuantityRecord[]>;
}
