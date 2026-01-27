import { Module } from '@nestjs/common';
import { RunlaneIdentityModule } from '@runlane/infrastructure';
import { WorkspacesController } from './workspaces.controller';

@Module({
  imports: [RunlaneIdentityModule],
  controllers: [WorkspacesController],
})
export class WorkspacesModule {}
