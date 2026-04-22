import {
  assertPlanLimitAvailable,
  buildCurrentUsagePeriod,
  demoLimitExceeded,
  getPlanResourceLimit,
  getUsageMetricPlanResource,
  getWorkspacePlanLimits,
  planWorkspaceNotFound,
} from '@runlane/domain';
import type { PlanLimitResource, UsageMetricType, WorkspacePlan } from '@runlane/domain';
import type { PlanLimitRepositoryPort, UsageMetricQuantityRecord } from '../../ports';

export interface EnforcePlanLimitInput {
  readonly workspaceId: string;
  readonly resource: PlanLimitResource;
  readonly now?: Date;
  readonly currentWorkflowCount?: number;
}

export type EnforceWorkflowCreationInput = Omit<EnforcePlanLimitInput, 'resource'>;

export interface DemoSafetyLimitOptions {
  readonly demoModeEnabled: boolean;
  readonly executionLimitPerHour: number;
  readonly aiCallLimitPerDay: number;
}

export interface CurrentPlanUsageSnapshot {
  readonly workspaceId: string;
  readonly plan: WorkspacePlan;
  readonly isDemo: boolean;
  readonly limits: {
    readonly workflows: number;
    readonly monthlyExecutions: number;
    readonly monthlyAiCalls: number;
    readonly monthlyHttpCalls: number;
    readonly monthlyWebhookRequests: number;
    readonly requestsPerMinute: number;
  };
  readonly used: {
    readonly workflows: number;
    readonly executions: number;
    readonly aiCalls: number;
    readonly httpCalls: number;
    readonly webhookRequests: number;
    readonly retries: number;
  };
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly metrics: readonly UsageMetricQuantityRecord[];
}

export class PlanLimitEnforcer {
  constructor(
    private readonly plans: PlanLimitRepositoryPort,
    private readonly demoLimits: DemoSafetyLimitOptions,
  ) {}

  async enforceWorkflowCreation(input: EnforceWorkflowCreationInput): Promise<void> {
    await this.enforce({ ...input, resource: 'workflow' });
  }

  async enforceExecutionCreation(input: Omit<EnforcePlanLimitInput, 'resource'>): Promise<void> {
    await this.enforce({ ...input, resource: 'execution' });
  }

  async enforceWebhookRequest(input: Omit<EnforcePlanLimitInput, 'resource'>): Promise<void> {
    await this.enforce({ ...input, resource: 'webhook_request' });
  }

  async enforceUsageMetric(input: {
    readonly workspaceId: string;
    readonly metric: UsageMetricType;
    readonly now?: Date;
  }): Promise<void> {
    const resource = getUsageMetricPlanResource(input.metric);

    if (!resource) {
      return;
    }

    await this.enforce({
      workspaceId: input.workspaceId,
      resource,
      ...(input.now ? { now: input.now } : {}),
    });
  }

  async getCurrentPlanUsage(input: {
    readonly workspaceId: string;
    readonly now?: Date;
  }): Promise<CurrentPlanUsageSnapshot> {
    const now = input.now ?? new Date();
    const period = buildCurrentUsagePeriod(now);
    const state = await this.plans.readCurrentUsage({
      workspaceId: input.workspaceId,
      periodStart: period.start,
      periodEnd: period.end,
    });

    if (!state) {
      throw planWorkspaceNotFound();
    }

    return buildUsageSnapshot({ state, period });
  }

  private async enforce(input: EnforcePlanLimitInput): Promise<void> {
    const snapshot = await this.getCurrentPlanUsage(input);
    const limit = getPlanResourceLimit(snapshot.limits, input.resource);
    const used = readUsedResourceValue(snapshot, input);

    assertPlanLimitAvailable({
      plan: snapshot.plan,
      resource: input.resource,
      used,
      limit,
    });

    await this.enforceDemoLimit(snapshot, input);
  }

  private async enforceDemoLimit(
    snapshot: CurrentPlanUsageSnapshot,
    input: EnforcePlanLimitInput,
  ): Promise<void> {
    if (!this.demoLimits.demoModeEnabled || !snapshot.isDemo) {
      return;
    }

    const now = input.now ?? new Date();

    if (input.resource === 'execution') {
      const periodEnd = now;
      const periodStart = new Date(periodEnd.getTime() - 60 * 60 * 1000);
      const used = await this.plans.readMetricQuantity({
        workspaceId: input.workspaceId,
        type: 'execution',
        periodStart,
        periodEnd,
      });

      if (used >= this.demoLimits.executionLimitPerHour) {
        throw demoLimitExceeded({
          resource: 'execution',
          used,
          limit: this.demoLimits.executionLimitPerHour,
          window: 'hour',
        });
      }
    }

    if (input.resource === 'ai_call') {
      const periodStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
      );
      const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
      const used = await this.plans.readMetricQuantity({
        workspaceId: input.workspaceId,
        type: 'ai_call',
        periodStart,
        periodEnd,
      });

      if (used >= this.demoLimits.aiCallLimitPerDay) {
        throw demoLimitExceeded({
          resource: 'ai_call',
          used,
          limit: this.demoLimits.aiCallLimitPerDay,
          window: 'day',
        });
      }
    }
  }
}

interface BuildUsageSnapshotInput {
  readonly state: {
    readonly workspaceId: string;
    readonly plan: WorkspacePlan;
    readonly isDemo: boolean;
    readonly workflowCount: number;
    readonly usage: readonly UsageMetricQuantityRecord[];
  };
  readonly period: {
    readonly start: Date;
    readonly end: Date;
  };
}

function buildUsageSnapshot(input: BuildUsageSnapshotInput): CurrentPlanUsageSnapshot {
  const limits = getWorkspacePlanLimits(input.state.plan);
  const quantities = buildUsageQuantityMap(input.state.usage);

  return {
    workspaceId: input.state.workspaceId,
    plan: input.state.plan,
    isDemo: input.state.isDemo,
    limits,
    used: {
      workflows: input.state.workflowCount,
      executions: quantities.get('execution') ?? 0,
      aiCalls: quantities.get('ai_call') ?? 0,
      httpCalls: quantities.get('http_call') ?? 0,
      webhookRequests: quantities.get('webhook_request') ?? 0,
      retries: quantities.get('retry') ?? 0,
    },
    periodStart: input.period.start,
    periodEnd: input.period.end,
    metrics: input.state.usage,
  };
}

function buildUsageQuantityMap(
  metrics: readonly UsageMetricQuantityRecord[],
): ReadonlyMap<UsageMetricType, number> {
  return new Map(metrics.map((metric) => [metric.type, metric.quantity]));
}

function readUsedResourceValue(
  snapshot: CurrentPlanUsageSnapshot,
  input: Pick<EnforcePlanLimitInput, 'resource' | 'currentWorkflowCount'>,
): number {
  if (input.resource === 'workflow') {
    return input.currentWorkflowCount ?? snapshot.used.workflows;
  }

  if (input.resource === 'execution') {
    return snapshot.used.executions;
  }

  if (input.resource === 'ai_call') {
    return snapshot.used.aiCalls;
  }

  if (input.resource === 'http_call') {
    return snapshot.used.httpCalls;
  }

  if (input.resource === 'webhook_request') {
    return snapshot.used.webhookRequests;
  }

  return 0;
}
