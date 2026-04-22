import { Module } from '@nestjs/common';
import { RunlaneDemoModule, RunlaneIdentityModule } from '@runlane/infrastructure';
import { DemoController } from './demo.controller';

@Module({
  imports: [RunlaneDemoModule, RunlaneIdentityModule],
  controllers: [DemoController],
})
export class DemoModule {}
