import { Module } from '@nestjs/common';
import {
  GetCurrentUsageUseCase,
  PLAN_LIMIT_REPOSITORY,
  PlanLimitEnforcer,
  USAGE_RECORD_REPOSITORY,
  UsageRecorder,
} from '@runlane/application';
import type { PlanLimitRepositoryPort, UsageRecordRepositoryPort } from '@runlane/application';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaPlanLimitRepository, PrismaUsageRecordRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    PrismaPlanLimitRepository,
    PrismaUsageRecordRepository,
    {
      provide: PLAN_LIMIT_REPOSITORY,
      useExisting: PrismaPlanLimitRepository,
    },
    {
      provide: USAGE_RECORD_REPOSITORY,
      useExisting: PrismaUsageRecordRepository,
    },
    {
      provide: UsageRecorder,
      inject: [USAGE_RECORD_REPOSITORY],
      useFactory: (usageRecords: UsageRecordRepositoryPort) => new UsageRecorder(usageRecords),
    },
    {
      provide: PlanLimitEnforcer,
      inject: [PLAN_LIMIT_REPOSITORY],
      useFactory: (plans: PlanLimitRepositoryPort) => new PlanLimitEnforcer(plans),
    },
    {
      provide: GetCurrentUsageUseCase,
      inject: [PlanLimitEnforcer],
      useFactory: (plans: PlanLimitEnforcer) => new GetCurrentUsageUseCase(plans),
    },
  ],
  exports: [
    PLAN_LIMIT_REPOSITORY,
    USAGE_RECORD_REPOSITORY,
    UsageRecorder,
    PlanLimitEnforcer,
    GetCurrentUsageUseCase,
  ],
})
export class RunlaneUsageModule {}
