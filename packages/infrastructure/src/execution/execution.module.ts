import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_STEP_REPOSITORY,
  ProcessExecutionUseCase,
  SafeTemplateResolver,
  TRANSACTION_BOUNDARY,
  ValidateExecutionJobForProcessingUseCase,
  WorkflowExecutionEngine,
  WORKFLOW_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  ExecutionRepositoryPort,
  ExecutionStepRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '@runlane/application';
import { RuntimeConfigService, RunlaneConfigModule } from '@runlane/config';
import { RunlaneAuditModule } from '../audit';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';
import { PrismaExecutionRepository, PrismaExecutionStepRepository } from './repositories';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule, RunlaneAuditModule, RunlaneWorkflowModule],
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
      inject: [EXECUTION_STEP_REPOSITORY, SafeTemplateResolver],
      useFactory: (steps: ExecutionStepRepositoryPort, templates: SafeTemplateResolver) =>
        new WorkflowExecutionEngine(steps, templates),
    },
    {
      provide: ValidateExecutionJobForProcessingUseCase,
      inject: [EXECUTION_REPOSITORY],
      useFactory: (executions: ExecutionRepositoryPort) =>
        new ValidateExecutionJobForProcessingUseCase(executions),
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
    ProcessExecutionUseCase,
    ValidateExecutionJobForProcessingUseCase,
    WorkflowExecutionEngine,
  ],
})
export class RunlaneExecutionModule {}
