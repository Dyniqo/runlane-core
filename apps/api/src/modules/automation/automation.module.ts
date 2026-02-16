import { Module } from '@nestjs/common';
import { RunlaneAccessModule, RunlaneAutomationModule } from '@runlane/infrastructure';
import { AutomationController } from './automation.controller';

@Module({
  imports: [RunlaneAccessModule, RunlaneAutomationModule],
  controllers: [AutomationController],
})
export class AutomationModule {}
