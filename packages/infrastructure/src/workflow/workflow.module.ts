import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  CreateWorkflowUseCase,
  CreateWorkflowTestContractUseCase,
  GetWorkflowUseCase,
  ListWorkflowsUseCase,
  PlanLimitEnforcer,
  PublishWorkflowUseCase,
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
import { RunlaneUsageModule } from '../usage';
import { PrismaWorkflowRepository } from './repositories';

@Module({
  imports: [RunlaneDatabaseModule, RunlaneAuditModule, RunlaneUsageModule],
  providers: [
    PrismaWorkflowRepository,
    {
      provide: WORKFLOW_REPOSITORY,
      useExisting: PrismaWorkflowRepository,
    },
    {
      provide: CreateWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY, AUDIT_LOG_REPOSITORY, TRANSACTION_BOUNDARY, PlanLimitEnforcer],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
        planLimits: PlanLimitEnforcer,
      ) => new CreateWorkflowUseCase(workflows, auditLogs, transactionBoundary, planLimits),
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
      provide: CreateWorkflowTestContractUseCase,
      inject: [WORKFLOW_REPOSITORY, AUDIT_LOG_REPOSITORY, TRANSACTION_BOUNDARY],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) => new CreateWorkflowTestContractUseCase(workflows, auditLogs, transactionBoundary),
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
    {
      provide: PublishWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY, AUDIT_LOG_REPOSITORY, TRANSACTION_BOUNDARY],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) => new PublishWorkflowUseCase(workflows, auditLogs, transactionBoundary),
    },
  ],
  exports: [
    CreateWorkflowUseCase,
    CreateWorkflowTestContractUseCase,
    GetWorkflowUseCase,
    ListWorkflowsUseCase,
    PublishWorkflowUseCase,
    UpdateWorkflowUseCase,
    WORKFLOW_REPOSITORY,
  ],
})
export class RunlaneWorkflowModule {}
