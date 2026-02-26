import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneRedisModule } from '../redis';
import { BullMqExecutionWorkerProcessor } from './execution-worker.processor';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Module({
  imports: [RunlaneConfigModule, RunlaneRedisModule],
  providers: [BullMqExecutionWorkerProcessor, WorkerHeartbeatService],
  exports: [BullMqExecutionWorkerProcessor, WorkerHeartbeatService],
})
export class RunlaneBullMqWorkerModule {}
