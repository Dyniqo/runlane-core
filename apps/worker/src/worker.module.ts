import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneHealthModule, RunlaneObservabilityModule } from '@runlane/infrastructure';
import { WorkerController } from './worker.controller';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneObservabilityModule.forRoot({ serviceName: 'worker' }),
    RunlaneHealthModule,
  ],
  controllers: [WorkerController],
})
export class WorkerModule {}
