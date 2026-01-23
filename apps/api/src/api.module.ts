import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneHealthModule, RunlaneObservabilityModule } from '@runlane/infrastructure';
import { ApiController } from './api.controller';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneObservabilityModule.forRoot({ serviceName: 'api' }),
    RunlaneHealthModule,
    AuthModule,
  ],
  controllers: [ApiController],
})
export class ApiModule {}
