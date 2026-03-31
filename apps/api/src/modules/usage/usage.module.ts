import { Module } from '@nestjs/common';
import { RunlaneIdentityModule, RunlaneUsageModule } from '@runlane/infrastructure';
import { UsageController } from './usage.controller';

@Module({
  imports: [RunlaneIdentityModule, RunlaneUsageModule],
  controllers: [UsageController],
})
export class UsageModule {}
