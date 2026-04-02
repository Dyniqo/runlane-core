import { Inject, Injectable } from '@nestjs/common';
import type {
  PlanLimitRepositoryPort,
  PlanLimitUsageRecord,
  ReadPlanLimitUsageInput,
  UsageMetricQuantityRecord,
} from '@runlane/application';
import { normalizeWorkspacePlan } from '@runlane/domain';
import type { UsageMetricType } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaPlanLimitRepository implements PlanLimitRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async readCurrentUsage(input: ReadPlanLimitUsageInput): Promise<PlanLimitUsageRecord | null> {
    const workspace = await this.persistence.client.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        id: true,
        plan: true,
      },
    });

    if (!workspace) {
      return null;
    }

    const [workflowCount, usage] = await Promise.all([
      this.persistence.client.workflow.count({
        where: { workspaceId: input.workspaceId },
      }),
      this.persistence.client.usageRecord.groupBy({
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
      }),
    ]);

    return {
      workspaceId: workspace.id,
      plan: normalizeWorkspacePlan(workspace.plan),
      workflowCount,
      usage: usage.map((row) => mapUsageMetricQuantity(row)),
    };
  }
}

interface PrismaUsageGroupByRecord {
  readonly type: string;
  readonly _sum: {
    readonly quantity: number | null;
  };
}

function mapUsageMetricQuantity(row: PrismaUsageGroupByRecord): UsageMetricQuantityRecord {
  return {
    type: mapUsageMetricType(row.type),
    quantity: row._sum.quantity ?? 0,
  };
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
