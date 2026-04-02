import type { WorkspacePlan } from '../workspace';
import { DomainError } from '../shared';
import type { UsageMetricType } from './usage-rules';

export const PLAN_LIMIT_RESOURCES = [
  'workflow',
  'execution',
  'ai_call',
  'http_call',
  'webhook_request',
  'rate_limit',
] as const;

export type PlanLimitResource = (typeof PLAN_LIMIT_RESOURCES)[number];

export interface WorkspacePlanLimits {
  readonly workflows: number;
  readonly monthlyExecutions: number;
  readonly monthlyAiCalls: number;
  readonly monthlyHttpCalls: number;
  readonly monthlyWebhookRequests: number;
  readonly requestsPerMinute: number;
}

export interface AssertPlanLimitAvailableInput {
  readonly plan: WorkspacePlan;
  readonly resource: PlanLimitResource;
  readonly used: number;
  readonly limit: number;
}

export const WORKSPACE_PLAN_LIMITS: Readonly<Record<WorkspacePlan, WorkspacePlanLimits>> = {
  free: {
    workflows: 2,
    monthlyExecutions: 100,
    monthlyAiCalls: 10,
    monthlyHttpCalls: 100,
    monthlyWebhookRequests: 100,
    requestsPerMinute: 25,
  },
  starter: {
    workflows: 10,
    monthlyExecutions: 5000,
    monthlyAiCalls: 500,
    monthlyHttpCalls: 5000,
    monthlyWebhookRequests: 5000,
    requestsPerMinute: 120,
  },
  pro: {
    workflows: 50,
    monthlyExecutions: 50000,
    monthlyAiCalls: 5000,
    monthlyHttpCalls: 50000,
    monthlyWebhookRequests: 50000,
    requestsPerMinute: 600,
  },
  agency: {
    workflows: 200,
    monthlyExecutions: 250000,
    monthlyAiCalls: 25000,
    monthlyHttpCalls: 250000,
    monthlyWebhookRequests: 250000,
    requestsPerMinute: 2000,
  },
};

export function getWorkspacePlanLimits(plan: WorkspacePlan): WorkspacePlanLimits {
  return WORKSPACE_PLAN_LIMITS[plan];
}

export function getUsageMetricPlanResource(metric: UsageMetricType): PlanLimitResource | null {
  if (metric === 'execution') {
    return 'execution';
  }

  if (metric === 'ai_call') {
    return 'ai_call';
  }

  if (metric === 'http_call') {
    return 'http_call';
  }

  if (metric === 'webhook_request') {
    return 'webhook_request';
  }

  return null;
}

export function getPlanResourceLimit(
  limits: WorkspacePlanLimits,
  resource: PlanLimitResource,
): number {
  if (resource === 'workflow') {
    return limits.workflows;
  }

  if (resource === 'execution') {
    return limits.monthlyExecutions;
  }

  if (resource === 'ai_call') {
    return limits.monthlyAiCalls;
  }

  if (resource === 'http_call') {
    return limits.monthlyHttpCalls;
  }

  if (resource === 'webhook_request') {
    return limits.monthlyWebhookRequests;
  }

  return limits.requestsPerMinute;
}

export function assertPlanLimitAvailable(input: AssertPlanLimitAvailableInput): void {
  if (!Number.isInteger(input.used) || input.used < 0) {
    throw planLimitInvalid('Plan limit usage value is invalid');
  }

  if (!Number.isInteger(input.limit) || input.limit < 0) {
    throw planLimitInvalid('Plan limit value is invalid');
  }

  if (input.used >= input.limit) {
    throw planLimitExceeded({
      plan: input.plan,
      resource: input.resource,
      limit: input.limit,
      used: input.used,
      remaining: 0,
    });
  }
}

export function planLimitExceeded(input: {
  readonly plan: WorkspacePlan;
  readonly resource: PlanLimitResource;
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
}): DomainError {
  return new DomainError({
    code: 'PLAN_LIMIT_EXCEEDED',
    category: input.resource === 'rate_limit' ? 'rate_limit' : 'business_rule',
    message: 'Workspace plan limit exceeded',
    details: {
      plan: input.plan,
      resource: input.resource,
      limit: input.limit,
      used: input.used,
      remaining: input.remaining,
    },
  });
}

export function planLimitInvalid(message: string): DomainError {
  return new DomainError({
    code: 'PLAN_LIMIT_INVALID',
    category: 'validation',
    message,
  });
}

export function planWorkspaceNotFound(): DomainError {
  return new DomainError({
    code: 'PLAN_WORKSPACE_NOT_FOUND',
    category: 'not_found',
    message: 'Workspace plan was not found',
  });
}
