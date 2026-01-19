import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneHealthModule, RunlaneObservabilityModule } from '@runlane/infrastructure';
import { ApiController } from './api.controller';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneObservabilityModule.forRoot({ serviceName: 'api' }),
    RunlaneHealthModule,
  ],
  controllers: [ApiController],
})
export class ApiModule {}
