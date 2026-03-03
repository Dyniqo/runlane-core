import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneExecutionModule } from '../execution';
import { RunlaneRedisModule } from '../redis';
import { BullMqExecutionWorkerProcessor } from './execution-worker.processor';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Module({
  imports: [RunlaneConfigModule, RunlaneExecutionModule, RunlaneRedisModule],
  providers: [BullMqExecutionWorkerProcessor, WorkerHeartbeatService],
  exports: [BullMqExecutionWorkerProcessor, WorkerHeartbeatService],
})
export class RunlaneBullMqWorkerModule {}
