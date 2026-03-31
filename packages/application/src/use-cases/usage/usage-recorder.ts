import type { JsonObject } from '@runlane/contracts';
import {
  normalizeUsageMetricType,
  normalizeUsageQuantity,
  normalizeUsageSourceId,
  normalizeUsageSourceType,
} from '@runlane/domain';
import type { UsageMetricType } from '@runlane/domain';
import type { CreateUsageRecordInput, UsageRecordRepositoryPort } from '../../ports';

export interface RecordUsageMetricInput {
  readonly workspaceId: string;
  readonly type: UsageMetricType;
  readonly quantity?: number;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly metadata?: JsonObject;
  readonly createdAt?: Date;
}

export class UsageRecorder {
  constructor(private readonly usageRecords: UsageRecordRepositoryPort) {}

  record(input: RecordUsageMetricInput): Promise<void> {
    return this.usageRecords.record(normalizeUsageRecord(input));
  }

  recordMany(records: readonly RecordUsageMetricInput[]): Promise<void> {
    return this.usageRecords.recordMany({
      records: records.map(normalizeUsageRecord),
    });
  }
}

function normalizeUsageRecord(input: RecordUsageMetricInput): CreateUsageRecordInput {
  return {
    workspaceId: input.workspaceId,
    type: normalizeUsageMetricType(input.type),
    quantity: normalizeUsageQuantity(input.quantity ?? 1),
    sourceType: normalizeUsageSourceType(input.sourceType),
    sourceId: normalizeUsageSourceId(input.sourceId),
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? new Date(),
  };
}
