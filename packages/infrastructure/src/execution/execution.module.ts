import { Module } from '@nestjs/common';
import {
  AI_PROVIDER,
  AUDIT_LOG_REPOSITORY,
  EXECUTION_QUEUE,
  EXECUTION_REPOSITORY,
  EXECUTION_STEP_REPOSITORY,
  HTTP_CONNECTOR,
  NOTIFICATION_CONNECTOR,
  SECRET_CIPHER,
  GetExecutionUseCase,
  ListExecutionsUseCase,
  ListExecutionStepsUseCase,
  ProcessExecutionUseCase,
  RetryExecutionUseCase,
  SafeTemplateResolver,
  TRANSACTION_BOUNDARY,
  ValidateExecutionJobForProcessingUseCase,
  WorkflowExecutionEngine,
  UsageRecorder,
  WORKFLOW_REPOSITORY,
  WORKFLOW_SECRET_REPOSITORY,
} from '@runlane/application';
import type {
  AiProviderPort,
  AuditLogRepositoryPort,
  ExecutionQueuePort,
  ExecutionRepositoryPort,
  ExecutionStepRepositoryPort,
  HttpConnectorPort,
  NotificationConnectorPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkflowSecretRepositoryPort,
  SecretCipherPort,
} from '@runlane/application';
import { RuntimeConfigService, RunlaneConfigModule } from '@runlane/config';
import { RunlaneAiModule } from '../ai';
import { RunlaneAuditModule } from '../audit';
import { RunlaneBullMqModule } from '../bullmq/bullmq.module';
import { RunlaneHttpConnectorModule } from '../connectors';
import { RunlaneNotificationModule } from '../notification';
import { RunlaneCryptoModule } from '../crypto';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';
import { RunlaneSecretsModule } from '../secrets';
import { RunlaneUsageModule } from '../usage';
import { PrismaExecutionRepository, PrismaExecutionStepRepository } from './repositories';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneAiModule,
    RunlaneDatabaseModule,
    RunlaneAuditModule,
    RunlaneWorkflowModule,
    RunlaneBullMqModule,
    RunlaneCryptoModule,
    RunlaneSecretsModule,
    RunlaneHttpConnectorModule,
    RunlaneNotificationModule,
    RunlaneUsageModule,
  ],
  providers: [
    PrismaExecutionRepository,
    PrismaExecutionStepRepository,
    {
      provide: EXECUTION_REPOSITORY,
      useExisting: PrismaExecutionRepository,
    },
    {
      provide: EXECUTION_STEP_REPOSITORY,
      useExisting: PrismaExecutionStepRepository,
    },
    SafeTemplateResolver,
    {
      provide: WorkflowExecutionEngine,
      inject: [
        EXECUTION_STEP_REPOSITORY,
        SafeTemplateResolver,
        WORKFLOW_SECRET_REPOSITORY,
        SECRET_CIPHER,
        HTTP_CONNECTOR,
        AI_PROVIDER,
        NOTIFICATION_CONNECTOR,
        UsageRecorder,
      ],
      useFactory: (
        steps: ExecutionStepRepositoryPort,
        templates: SafeTemplateResolver,
        secrets: WorkflowSecretRepositoryPort,
        cipher: SecretCipherPort,
        httpConnector: HttpConnectorPort,
        aiProvider: AiProviderPort,
        notificationConnector: NotificationConnectorPort,
        usage: UsageRecorder,
      ) =>
        new WorkflowExecutionEngine(
          steps,
          templates,
          secrets,
          cipher,
          httpConnector,
          aiProvider,
          notificationConnector,
          usage,
        ),
    },
    {
      provide: ValidateExecutionJobForProcessingUseCase,
      inject: [EXECUTION_REPOSITORY],
      useFactory: (executions: ExecutionRepositoryPort) =>
        new ValidateExecutionJobForProcessingUseCase(executions),
    },
    {
      provide: ListExecutionsUseCase,
      inject: [EXECUTION_REPOSITORY, WORKFLOW_REPOSITORY],
      useFactory: (executions: ExecutionRepositoryPort, workflows: WorkflowRepositoryPort) =>
        new ListExecutionsUseCase(executions, workflows),
    },
    {
      provide: GetExecutionUseCase,
      inject: [EXECUTION_REPOSITORY, WORKFLOW_REPOSITORY],
      useFactory: (executions: ExecutionRepositoryPort, workflows: WorkflowRepositoryPort) =>
        new GetExecutionUseCase(executions, workflows),
    },
    {
      provide: ListExecutionStepsUseCase,
      inject: [EXECUTION_REPOSITORY, EXECUTION_STEP_REPOSITORY],
      useFactory: (executions: ExecutionRepositoryPort, steps: ExecutionStepRepositoryPort) =>
        new ListExecutionStepsUseCase(executions, steps),
    },
    {
      provide: RetryExecutionUseCase,
      inject: [
        EXECUTION_REPOSITORY,
        WORKFLOW_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        EXECUTION_QUEUE,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        executions: ExecutionRepositoryPort,
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        executionQueue: ExecutionQueuePort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new RetryExecutionUseCase(
          executions,
          workflows,
          auditLogs,
          executionQueue,
          transactionBoundary,
        ),
    },
    {
      provide: ProcessExecutionUseCase,
      inject: [
        EXECUTION_REPOSITORY,
        WORKFLOW_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
        WorkflowExecutionEngine,
        RuntimeConfigService,
        NOTIFICATION_CONNECTOR,
        UsageRecorder,
      ],
      useFactory: (
        executions: ExecutionRepositoryPort,
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
        engine: WorkflowExecutionEngine,
        config: RuntimeConfigService,
        notificationConnector: NotificationConnectorPort,
        usage: UsageRecorder,
      ) =>
        new ProcessExecutionUseCase(
          executions,
          workflows,
          auditLogs,
          transactionBoundary,
          engine,
          {
            maxAttempts: config.executionRetryMaxAttempts,
            baseDelayMs: config.executionRetryBaseDelayMs,
            maxDelayMs: config.executionRetryMaxDelayMs,
          },
          notificationConnector,
          usage,
        ),
    },
  ],
  exports: [
    EXECUTION_REPOSITORY,
    EXECUTION_STEP_REPOSITORY,
    GetExecutionUseCase,
    ListExecutionsUseCase,
    ListExecutionStepsUseCase,
    ProcessExecutionUseCase,
    RetryExecutionUseCase,
    ValidateExecutionJobForProcessingUseCase,
    WorkflowExecutionEngine,
  ],
})
export class RunlaneExecutionModule {}
