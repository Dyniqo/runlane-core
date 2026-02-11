import { Module } from '@nestjs/common';
import { RunlaneIngestionModule } from '@runlane/infrastructure';
import { HooksController } from './hooks.controller';

@Module({
  imports: [RunlaneIngestionModule],
  controllers: [HooksController],
})
export class HooksModule {}
