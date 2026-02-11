import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  ReceivePublicWebhookUseCase,
  TRANSACTION_BOUNDARY,
  WEBHOOK_REQUEST_REPOSITORY,
  WORKFLOW_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WebhookRequestRepositoryPort,
  WorkflowRepositoryPort,
} from '@runlane/application';
import { RunlaneAuditModule } from '../audit';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';
import { PrismaWebhookRequestRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule, RunlaneAuditModule, RunlaneWorkflowModule],
  providers: [
    PrismaWebhookRequestRepository,
    {
      provide: WEBHOOK_REQUEST_REPOSITORY,
      useExisting: PrismaWebhookRequestRepository,
    },
    {
      provide: ReceivePublicWebhookUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        WEBHOOK_REQUEST_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        webhookRequests: WebhookRequestRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new ReceivePublicWebhookUseCase(workflows, webhookRequests, auditLogs, transactionBoundary),
    },
  ],
  exports: [ReceivePublicWebhookUseCase, WEBHOOK_REQUEST_REPOSITORY],
})
export class RunlaneIngestionModule {}
