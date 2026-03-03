import { Module } from '@nestjs/common';
import {
  EXECUTION_REPOSITORY,
  ValidateExecutionJobForProcessingUseCase,
} from '@runlane/application';
import type { ExecutionRepositoryPort } from '@runlane/application';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaExecutionRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    PrismaExecutionRepository,
    {
      provide: EXECUTION_REPOSITORY,
      useExisting: PrismaExecutionRepository,
    },
    {
      provide: ValidateExecutionJobForProcessingUseCase,
      inject: [EXECUTION_REPOSITORY],
      useFactory: (executions: ExecutionRepositoryPort) =>
        new ValidateExecutionJobForProcessingUseCase(executions),
    },
  ],
  exports: [EXECUTION_REPOSITORY, ValidateExecutionJobForProcessingUseCase],
})
export class RunlaneExecutionModule {}
