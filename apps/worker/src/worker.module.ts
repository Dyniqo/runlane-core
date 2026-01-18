import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneDatabaseModule, RunlaneObservabilityModule } from '@runlane/infrastructure';
import { WorkerController } from './worker.controller';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneObservabilityModule.forRoot({ serviceName: 'worker' }),
    RunlaneDatabaseModule,
  ],
  controllers: [WorkerController],
})
export class WorkerModule {}
