import { Module } from '@nestjs/common';
import { AUDIT_LOG_REPOSITORY, ListAuditLogsUseCase } from '@runlane/application';
import type { AuditLogRepositoryPort } from '@runlane/application';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaAuditLogRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    PrismaAuditLogRepository,
    {
      provide: AUDIT_LOG_REPOSITORY,
      useExisting: PrismaAuditLogRepository,
    },
    {
      provide: ListAuditLogsUseCase,
      inject: [AUDIT_LOG_REPOSITORY],
      useFactory: (auditLogs: AuditLogRepositoryPort) => new ListAuditLogsUseCase(auditLogs),
    },
  ],
  exports: [AUDIT_LOG_REPOSITORY, ListAuditLogsUseCase],
})
export class RunlaneAuditModule {}
