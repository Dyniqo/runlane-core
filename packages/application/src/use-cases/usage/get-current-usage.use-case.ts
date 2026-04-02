import type { CurrentUsageResponseDto } from '@runlane/contracts';
import type { WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { buildCurrentUsageResponse } from './current-usage-response';
import type { PlanLimitEnforcer } from './plan-limit-enforcer';

export interface GetCurrentUsageUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly now?: Date;
}

export class GetCurrentUsageUseCase implements UseCase<
  GetCurrentUsageUseCaseInput,
  CurrentUsageResponseDto
> {
  constructor(private readonly plans: PlanLimitEnforcer) {}

  async execute(input: GetCurrentUsageUseCaseInput): Promise<CurrentUsageResponseDto> {
    const planInput = input.now
      ? { workspaceId: input.scope.workspaceId, now: input.now }
      : { workspaceId: input.scope.workspaceId };
    const plan = await this.plans.getCurrentPlanUsage(planInput);

    return buildCurrentUsageResponse({
      workspaceId: input.scope.workspaceId,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      metrics: plan.metrics,
      plan,
    });
  }
}
