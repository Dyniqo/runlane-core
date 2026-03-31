import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  EXECUTION_QUEUE,
  EXECUTION_REPOSITORY,
  ExecuteAutomationWorkflowUseCase,
  GetAutomationWorkflowContractUseCase,
  TRANSACTION_BOUNDARY,
  UsageRecorder,
  WORKFLOW_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  ExecutionQueuePort,
  ExecutionRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '@runlane/application';
import { RunlaneAccessModule } from '../access';
import { RunlaneAuditModule } from '../audit';
import { RunlaneBullMqModule } from '../bullmq';
import { RunlaneExecutionModule } from '../execution';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';
import { RunlaneUsageModule } from '../usage';

@Module({
  imports: [
    RunlaneAccessModule,
    RunlaneAuditModule,
    RunlaneBullMqModule,
    RunlaneDatabaseModule,
    RunlaneExecutionModule,
    RunlaneUsageModule,
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
        EXECUTION_QUEUE,
        TRANSACTION_BOUNDARY,
        UsageRecorder,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        executions: ExecutionRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        executionQueue: ExecutionQueuePort,
        transactionBoundary: TransactionBoundary,
        usage: UsageRecorder,
      ) =>
        new ExecuteAutomationWorkflowUseCase(
          workflows,
          executions,
          auditLogs,
          executionQueue,
          transactionBoundary,
          usage,
        ),
    },
  ],
  exports: [ExecuteAutomationWorkflowUseCase, GetAutomationWorkflowContractUseCase],
})
export class RunlaneAutomationModule {}
