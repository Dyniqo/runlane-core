import { Module } from '@nestjs/common';
import { RunlaneIdentityModule, RunlaneSecretsModule } from '@runlane/infrastructure';
import { SecretsController } from './secrets.controller';

@Module({
  imports: [RunlaneIdentityModule, RunlaneSecretsModule],
  controllers: [SecretsController],
})
export class SecretsModule {}
