import { Module } from '@nestjs/common';
import { EXECUTION_REPOSITORY } from '@runlane/application';
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
  ],
  exports: [EXECUTION_REPOSITORY],
})
export class RunlaneExecutionModule {}
