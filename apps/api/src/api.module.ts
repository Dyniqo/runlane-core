import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import {
  RunlaneHealthModule,
  RunlaneObservabilityModule,
  RunlaneSecurityModule,
} from '@runlane/infrastructure';
import { ApiController } from './api.controller';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuditLogsModule } from './modules/audit/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneObservabilityModule.forRoot({ serviceName: 'api' }),
    RunlaneHealthModule,
    RunlaneSecurityModule,
    AuthModule,
    WorkspacesModule,
    ApiKeysModule,
    AuditLogsModule,
  ],
  controllers: [ApiController],
})
export class ApiModule {}
