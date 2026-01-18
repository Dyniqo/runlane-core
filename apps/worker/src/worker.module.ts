import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { WorkerController } from './worker.controller';

@Module({
  imports: [RunlaneConfigModule],
  controllers: [WorkerController],
})
export class WorkerModule {}
