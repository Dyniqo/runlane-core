import { Module } from '@nestjs/common';
import { RunlaneAccessModule, RunlaneIdentityModule } from '@runlane/infrastructure';
import { ApiKeysController } from './api-keys.controller';

@Module({
  imports: [RunlaneIdentityModule, RunlaneAccessModule],
  controllers: [ApiKeysController],
})
export class ApiKeysModule {}
