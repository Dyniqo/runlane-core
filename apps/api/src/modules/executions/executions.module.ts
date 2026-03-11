import { Module } from '@nestjs/common';
import { RunlaneExecutionModule, RunlaneIdentityModule } from '@runlane/infrastructure';
import { ExecutionsController } from './executions.controller';

@Module({
  imports: [RunlaneIdentityModule, RunlaneExecutionModule],
  controllers: [ExecutionsController],
})
export class ExecutionsModule {}
