import type { CurrentUsageResponseDto, UsageMetricDto } from '@runlane/contracts';
import { USAGE_METRIC_TYPES } from '@runlane/domain';
import type { UsageMetricType } from '@runlane/domain';
import type { UsageMetricQuantityRecord } from '../../ports';

const ZERO_TOTALS = {
  executions: 0,
  aiCalls: 0,
  httpCalls: 0,
  webhookRequests: 0,
  retries: 0,
} as const;

export function buildCurrentUsageResponse(input: {
  readonly workspaceId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly metrics: readonly UsageMetricQuantityRecord[];
}): CurrentUsageResponseDto {
  const quantities = new Map<UsageMetricType, number>();

  for (const metric of input.metrics) {
    quantities.set(metric.type, metric.quantity);
  }

  const normalizedMetrics: UsageMetricDto[] = USAGE_METRIC_TYPES.map((type) => ({
    type,
    quantity: quantities.get(type) ?? 0,
  }));

  return {
    workspaceId: input.workspaceId,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    totals: {
      ...ZERO_TOTALS,
      executions: quantities.get('execution') ?? 0,
      aiCalls: quantities.get('ai_call') ?? 0,
      httpCalls: quantities.get('http_call') ?? 0,
      webhookRequests: quantities.get('webhook_request') ?? 0,
      retries: quantities.get('retry') ?? 0,
    },
    metrics: normalizedMetrics,
  };
}
