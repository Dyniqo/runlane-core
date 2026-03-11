import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import {
  RunlaneHealthModule,
  RunlaneObservabilityModule,
  RunlaneSecurityModule,
} from '@runlane/infrastructure';
import { ApiController } from './api.controller';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AuditLogsModule } from './modules/audit/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExecutionsModule } from './modules/executions/executions.module';
import { HooksModule } from './modules/hooks/hooks.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
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
    AutomationModule,
    AuditLogsModule,
    WorkflowsModule,
    ExecutionsModule,
    HooksModule,
  ],
  controllers: [ApiController],
})
export class ApiModule {}
