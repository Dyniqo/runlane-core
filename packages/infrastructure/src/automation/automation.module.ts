import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  EXECUTION_REPOSITORY,
  ExecuteAutomationWorkflowUseCase,
  GetAutomationWorkflowContractUseCase,
  TRANSACTION_BOUNDARY,
  WORKFLOW_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  ExecutionRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '@runlane/application';
import { RunlaneAccessModule } from '../access';
import { RunlaneAuditModule } from '../audit';
import { RunlaneExecutionModule } from '../execution';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';

@Module({
  imports: [
    RunlaneAccessModule,
    RunlaneAuditModule,
    RunlaneDatabaseModule,
    RunlaneExecutionModule,
    RunlaneWorkflowModule,
  ],
  providers: [
    {
      provide: GetAutomationWorkflowContractUseCase,
      inject: [WORKFLOW_REPOSITORY],
      useFactory: (workflows: WorkflowRepositoryPort) =>
        new GetAutomationWorkflowContractUseCase(workflows),
    },
    {
      provide: ExecuteAutomationWorkflowUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        EXECUTION_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        executions: ExecutionRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new ExecuteAutomationWorkflowUseCase(workflows, executions, auditLogs, transactionBoundary),
    },
  ],
  exports: [ExecuteAutomationWorkflowUseCase, GetAutomationWorkflowContractUseCase],
})
export class RunlaneAutomationModule {}
