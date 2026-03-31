import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateUsageRecordInput,
  CreateUsageRecordsInput,
  GetUsageSummaryInput,
  UsageMetricQuantityRecord,
  UsageRecordRepositoryPort,
} from '@runlane/application';
import type { UsageMetricType } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaUsageRecordRepository implements UsageRecordRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async record(input: CreateUsageRecordInput): Promise<void> {
    await this.recordMany({ records: [input] });
  }

  async recordMany(input: CreateUsageRecordsInput): Promise<void> {
    if (input.records.length === 0) {
      return;
    }

    await this.persistence.client.usageRecord.createMany({
      data: input.records.map((record) => ({
        workspaceId: record.workspaceId,
        type: mapUsageMetricTypeToPrisma(record.type),
        quantity: record.quantity,
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        metadataJson: record.metadata as Prisma.InputJsonValue,
        createdAt: record.createdAt,
      })),
      skipDuplicates: true,
    });
  }

  async summarizeCurrentPeriod(
    input: GetUsageSummaryInput,
  ): Promise<readonly UsageMetricQuantityRecord[]> {
    const rows = await this.persistence.client.usageRecord.groupBy({
      by: ['type'],
      where: {
        workspaceId: input.workspaceId,
        createdAt: {
          gte: input.periodStart,
          lt: input.periodEnd,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    return rows.map((row) => ({
      type: mapUsageMetricType(row.type),
      quantity: row._sum.quantity ?? 0,
    }));
  }
}

function mapUsageMetricType(type: string): UsageMetricType {
  if (type === 'EXECUTION') {
    return 'execution';
  }

  if (type === 'AI_CALL') {
    return 'ai_call';
  }

  if (type === 'HTTP_CALL') {
    return 'http_call';
  }

  if (type === 'WEBHOOK_REQUEST') {
    return 'webhook_request';
  }

  if (type === 'RETRY') {
    return 'retry';
  }

  throw new TypeError(`Unsupported usage metric type '${type}'`);
}

function mapUsageMetricTypeToPrisma(
  type: UsageMetricType,
): 'EXECUTION' | 'AI_CALL' | 'HTTP_CALL' | 'WEBHOOK_REQUEST' | 'RETRY' {
  if (type === 'execution') {
    return 'EXECUTION';
  }

  if (type === 'ai_call') {
    return 'AI_CALL';
  }

  if (type === 'http_call') {
    return 'HTTP_CALL';
  }

  if (type === 'webhook_request') {
    return 'WEBHOOK_REQUEST';
  }

  if (type === 'retry') {
    return 'RETRY';
  }

  throw new TypeError(`Unsupported usage metric type '${type}'`);
}
