import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  EXECUTION_QUEUE,
  EXECUTION_REPOSITORY,
  EXECUTION_STEP_REPOSITORY,
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
  WORKFLOW_REPOSITORY,
  WORKFLOW_SECRET_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  ExecutionQueuePort,
  ExecutionRepositoryPort,
  ExecutionStepRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkflowSecretRepositoryPort,
  SecretCipherPort,
} from '@runlane/application';
import { RuntimeConfigService, RunlaneConfigModule } from '@runlane/config';
import { RunlaneAuditModule } from '../audit';
import { RunlaneBullMqModule } from '../bullmq/bullmq.module';
import { RunlaneCryptoModule } from '../crypto';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';
import { RunlaneSecretsModule } from '../secrets';
import { PrismaExecutionRepository, PrismaExecutionStepRepository } from './repositories';

@Module({
  imports: [
    RunlaneConfigModule,
    RunlaneDatabaseModule,
    RunlaneAuditModule,
    RunlaneWorkflowModule,
    RunlaneBullMqModule,
    RunlaneCryptoModule,
    RunlaneSecretsModule,
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
      ],
      useFactory: (
        steps: ExecutionStepRepositoryPort,
        templates: SafeTemplateResolver,
        secrets: WorkflowSecretRepositoryPort,
        cipher: SecretCipherPort,
      ) => new WorkflowExecutionEngine(steps, templates, secrets, cipher),
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
      ],
      useFactory: (
        executions: ExecutionRepositoryPort,
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
        engine: WorkflowExecutionEngine,
        config: RuntimeConfigService,
      ) =>
        new ProcessExecutionUseCase(executions, workflows, auditLogs, transactionBoundary, engine, {
          maxAttempts: config.executionRetryMaxAttempts,
          baseDelayMs: config.executionRetryBaseDelayMs,
          maxDelayMs: config.executionRetryMaxDelayMs,
        }),
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
