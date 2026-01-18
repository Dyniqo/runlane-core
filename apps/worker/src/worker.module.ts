import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneDatabaseModule } from '@runlane/infrastructure';
import { WorkerController } from './worker.controller';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule],
  controllers: [WorkerController],
})
export class WorkerModule {}
