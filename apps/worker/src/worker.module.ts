import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import {
  RunlaneBullMqWorkerModule,
  RunlaneHealthModule,
  RunlaneObservabilityModule,
} from '@runlane/infrastructure';
import { WorkerController } from './worker.controller';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneObservabilityModule.forRoot({ serviceName: 'worker' }),
    RunlaneHealthModule,
    RunlaneBullMqWorkerModule,
  ],
  controllers: [WorkerController],
})
export class WorkerModule {}
