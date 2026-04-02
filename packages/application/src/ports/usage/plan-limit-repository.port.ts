import type { WorkspacePlan } from '@runlane/domain';
import type { UsageMetricQuantityRecord } from './usage-record-repository.port';

export const PLAN_LIMIT_REPOSITORY = Symbol('PLAN_LIMIT_REPOSITORY');

export interface ReadPlanLimitUsageInput {
  readonly workspaceId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

export interface PlanLimitUsageRecord {
  readonly workspaceId: string;
  readonly plan: WorkspacePlan;
  readonly workflowCount: number;
  readonly usage: readonly UsageMetricQuantityRecord[];
}

export interface PlanLimitRepositoryPort {
  readCurrentUsage(input: ReadPlanLimitUsageInput): Promise<PlanLimitUsageRecord | null>;
}
