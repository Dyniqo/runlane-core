import { Module } from '@nestjs/common';
import {
  GetCurrentUsageUseCase,
  USAGE_RECORD_REPOSITORY,
  UsageRecorder,
} from '@runlane/application';
import type { UsageRecordRepositoryPort } from '@runlane/application';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaUsageRecordRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    PrismaUsageRecordRepository,
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
      provide: GetCurrentUsageUseCase,
      inject: [USAGE_RECORD_REPOSITORY],
      useFactory: (usageRecords: UsageRecordRepositoryPort) =>
        new GetCurrentUsageUseCase(usageRecords),
    },
  ],
  exports: [USAGE_RECORD_REPOSITORY, UsageRecorder, GetCurrentUsageUseCase],
})
export class RunlaneUsageModule {}
