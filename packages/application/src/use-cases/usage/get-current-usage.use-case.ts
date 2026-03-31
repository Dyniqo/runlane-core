import type { CurrentUsageResponseDto } from '@runlane/contracts';
import { buildCurrentUsagePeriod } from '@runlane/domain';
import type { UsageRecordRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { buildCurrentUsageResponse } from './current-usage-response';

export interface GetCurrentUsageUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly now?: Date;
}

export class GetCurrentUsageUseCase implements UseCase<
  GetCurrentUsageUseCaseInput,
  CurrentUsageResponseDto
> {
  constructor(private readonly usageRecords: UsageRecordRepositoryPort) {}

  async execute(input: GetCurrentUsageUseCaseInput): Promise<CurrentUsageResponseDto> {
    const period = buildCurrentUsagePeriod(input.now ?? new Date());
    const metrics = await this.usageRecords.summarizeCurrentPeriod({
      workspaceId: input.scope.workspaceId,
      periodStart: period.start,
      periodEnd: period.end,
    });

    return buildCurrentUsageResponse({
      workspaceId: input.scope.workspaceId,
      periodStart: period.start,
      periodEnd: period.end,
      metrics,
    });
  }
}
