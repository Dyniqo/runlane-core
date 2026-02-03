import { Module } from '@nestjs/common';
import { RunlaneIdentityModule, RunlaneWorkflowModule } from '@runlane/infrastructure';
import { WorkflowsController } from './workflows.controller';

@Module({
  imports: [RunlaneIdentityModule, RunlaneWorkflowModule],
  controllers: [WorkflowsController],
})
export class WorkflowsModule {}
