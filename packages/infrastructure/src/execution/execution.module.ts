import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  EXECUTION_REPOSITORY,
  ProcessExecutionUseCase,
  TRANSACTION_BOUNDARY,
  ValidateExecutionJobForProcessingUseCase,
  WorkflowExecutionEngine,
  WORKFLOW_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  ExecutionRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '@runlane/application';
import { RunlaneAuditModule } from '../audit';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';
import { PrismaExecutionRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule, RunlaneAuditModule, RunlaneWorkflowModule],
  providers: [
    PrismaExecutionRepository,
    WorkflowExecutionEngine,
    {
      provide: EXECUTION_REPOSITORY,
      useExisting: PrismaExecutionRepository,
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
      ],
      useFactory: (
        executions: ExecutionRepositoryPort,
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
        engine: WorkflowExecutionEngine,
      ) =>
        new ProcessExecutionUseCase(executions, workflows, auditLogs, transactionBoundary, engine),
    },
  ],
  exports: [
    EXECUTION_REPOSITORY,
    ProcessExecutionUseCase,
    ValidateExecutionJobForProcessingUseCase,
    WorkflowExecutionEngine,
  ],
})
export class RunlaneExecutionModule {}
