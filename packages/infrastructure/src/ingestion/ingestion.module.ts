import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  ReceivePublicWebhookUseCase,
  TRANSACTION_BOUNDARY,
  WEBHOOK_REQUEST_REPOSITORY,
  WEBHOOK_RUNTIME_STATE,
  WORKFLOW_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WebhookRequestRepositoryPort,
  WebhookRuntimeStatePort,
  WorkflowRepositoryPort,
} from '@runlane/application';
import { RuntimeConfigService, RunlaneConfigModule } from '@runlane/config';
import { RunlaneAuditModule } from '../audit';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneRedisModule } from '../redis';
import { RunlaneWorkflowModule } from '../workflow';
import { PrismaWebhookRequestRepository } from './repositories';
import { RedisWebhookRuntimeState } from './runtime';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneDatabaseModule,
    RunlaneRedisModule,
    RunlaneAuditModule,
    RunlaneWorkflowModule,
  ],
  providers: [
    PrismaWebhookRequestRepository,
    RedisWebhookRuntimeState,
    {
      provide: WEBHOOK_REQUEST_REPOSITORY,
      useExisting: PrismaWebhookRequestRepository,
    },
    {
      provide: WEBHOOK_RUNTIME_STATE,
      useExisting: RedisWebhookRuntimeState,
    },
    {
      provide: ReceivePublicWebhookUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        WEBHOOK_REQUEST_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        WEBHOOK_RUNTIME_STATE,
        TRANSACTION_BOUNDARY,
        RuntimeConfigService,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        webhookRequests: WebhookRequestRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        runtimeState: WebhookRuntimeStatePort,
        transactionBoundary: TransactionBoundary,
        config: RuntimeConfigService,
      ) =>
        new ReceivePublicWebhookUseCase(
          workflows,
          webhookRequests,
          auditLogs,
          runtimeState,
          transactionBoundary,
          {
            webhookSigningSecret: config.webhookSigningSecret,
            signatureToleranceSeconds: config.webhookSignatureToleranceSeconds,
            replayProtectionTtlSeconds: config.webhookReplayTtlSeconds,
            idempotencyTtlSeconds: config.webhookIdempotencyTtlSeconds,
          },
        ),
    },
  ],
  exports: [ReceivePublicWebhookUseCase, WEBHOOK_REQUEST_REPOSITORY],
})
export class RunlaneIngestionModule {}
