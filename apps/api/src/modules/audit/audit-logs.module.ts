import { Module } from '@nestjs/common';
import { RunlaneAuditModule, RunlaneIdentityModule } from '@runlane/infrastructure';
import { AuditLogsController } from './audit-logs.controller';

@Module({
  imports: [RunlaneIdentityModule, RunlaneAuditModule],
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}
