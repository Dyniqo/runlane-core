import { Module } from '@nestjs/common';
import { EXECUTION_QUEUE } from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { BullMqExecutionQueueProducer, executionQueueProvider } from './execution-queue.producer';

@Module({
  imports: [RunlaneConfigModule],
  providers: [BullMqExecutionQueueProducer, executionQueueProvider],
  exports: [BullMqExecutionQueueProducer, EXECUTION_QUEUE],
})
export class RunlaneBullMqModule {}
