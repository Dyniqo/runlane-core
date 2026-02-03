import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  CreateWorkflowUseCase,
  GetWorkflowUseCase,
  ListWorkflowsUseCase,
  TRANSACTION_BOUNDARY,
  UpdateWorkflowUseCase,
  WORKFLOW_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '@runlane/application';
import { RunlaneAuditModule } from '../audit';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaWorkflowRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule, RunlaneAuditModule],
  providers: [
    PrismaWorkflowRepository,
    {
      provide: WORKFLOW_REPOSITORY,
      useExisting: PrismaWorkflowRepository,
    },
    {
      provide: CreateWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY, AUDIT_LOG_REPOSITORY, TRANSACTION_BOUNDARY],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) => new CreateWorkflowUseCase(workflows, auditLogs, transactionBoundary),
    },
    {
      provide: ListWorkflowsUseCase,
      inject: [WORKFLOW_REPOSITORY],
      useFactory: (workflows: WorkflowRepositoryPort) => new ListWorkflowsUseCase(workflows),
    },
    {
      provide: GetWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY],
      useFactory: (workflows: WorkflowRepositoryPort) => new GetWorkflowUseCase(workflows),
    },
    {
      provide: UpdateWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY, AUDIT_LOG_REPOSITORY, TRANSACTION_BOUNDARY],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) => new UpdateWorkflowUseCase(workflows, auditLogs, transactionBoundary),
    },
  ],
  exports: [
    CreateWorkflowUseCase,
    GetWorkflowUseCase,
    ListWorkflowsUseCase,
    UpdateWorkflowUseCase,
    WORKFLOW_REPOSITORY,
  ],
})
export class RunlaneWorkflowModule {}
