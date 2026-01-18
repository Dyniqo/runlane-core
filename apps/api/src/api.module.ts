import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneDatabaseModule, RunlaneObservabilityModule } from '@runlane/infrastructure';
import { ApiController } from './api.controller';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneObservabilityModule.forRoot({ serviceName: 'api' }),
    RunlaneDatabaseModule,
  ],
  controllers: [ApiController],
})
export class ApiModule {}
