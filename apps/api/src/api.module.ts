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
import { BillingModule } from './modules/billing/billing.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExecutionsModule } from './modules/executions/executions.module';
import { HooksModule } from './modules/hooks/hooks.module';
import { SecretsModule } from './modules/secrets/secrets.module';
import { UsageModule } from './modules/usage/usage.module';
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
    BillingModule,
    WorkflowsModule,
    ExecutionsModule,
    HooksModule,
    SecretsModule,
    UsageModule,
  ],
  controllers: [ApiController],
})
export class ApiModule {}
