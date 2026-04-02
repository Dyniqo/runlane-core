import type { CurrentUsageResponseDto, UsageMetricDto } from '@runlane/contracts';
import { USAGE_METRIC_TYPES } from '@runlane/domain';
import type { UsageMetricType } from '@runlane/domain';
import type { UsageMetricQuantityRecord } from '../../ports';
import type { CurrentPlanUsageSnapshot } from './plan-limit-enforcer';

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
  readonly plan: CurrentPlanUsageSnapshot;
}): CurrentUsageResponseDto {
  const quantities = new Map<UsageMetricType, number>();

  for (const metric of input.metrics) {
    quantities.set(metric.type, metric.quantity);
  }

  const normalizedMetrics: UsageMetricDto[] = USAGE_METRIC_TYPES.map((type) => ({
    type,
    quantity: quantities.get(type) ?? 0,
  }));

  const totals = {
    ...ZERO_TOTALS,
    executions: quantities.get('execution') ?? 0,
    aiCalls: quantities.get('ai_call') ?? 0,
    httpCalls: quantities.get('http_call') ?? 0,
    webhookRequests: quantities.get('webhook_request') ?? 0,
    retries: quantities.get('retry') ?? 0,
  };

  return {
    workspaceId: input.workspaceId,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    plan: {
      name: input.plan.plan,
      limits: {
        workflows: input.plan.limits.workflows,
        executions: input.plan.limits.monthlyExecutions,
        aiCalls: input.plan.limits.monthlyAiCalls,
        httpCalls: input.plan.limits.monthlyHttpCalls,
        webhookRequests: input.plan.limits.monthlyWebhookRequests,
        requestsPerMinute: input.plan.limits.requestsPerMinute,
      },
      used: input.plan.used,
      remaining: {
        workflows: Math.max(input.plan.limits.workflows - input.plan.used.workflows, 0),
        executions: Math.max(input.plan.limits.monthlyExecutions - totals.executions, 0),
        aiCalls: Math.max(input.plan.limits.monthlyAiCalls - totals.aiCalls, 0),
        httpCalls: Math.max(input.plan.limits.monthlyHttpCalls - totals.httpCalls, 0),
        webhookRequests: Math.max(
          input.plan.limits.monthlyWebhookRequests - totals.webhookRequests,
          0,
        ),
        requestsPerMinute: input.plan.limits.requestsPerMinute,
      },
    },
    totals,
    metrics: normalizedMetrics,
  };
}
