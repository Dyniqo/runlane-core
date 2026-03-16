import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  CONNECTOR_CREDENTIAL_REPOSITORY,
  DeleteConnectorCredentialUseCase,
  DeleteWorkflowSecretUseCase,
  ListConnectorCredentialsUseCase,
  ListWorkflowSecretsUseCase,
  SECRET_CIPHER,
  TRANSACTION_BOUNDARY,
  UpsertConnectorCredentialUseCase,
  UpsertWorkflowSecretUseCase,
  WORKFLOW_REPOSITORY,
  WORKFLOW_SECRET_REPOSITORY,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  ConnectorCredentialRepositoryPort,
  SecretCipherPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkflowSecretRepositoryPort,
} from '@runlane/application';
import { RunlaneAuditModule } from '../audit';
import { RunlaneCryptoModule } from '../crypto';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneWorkflowModule } from '../workflow';
import {
  PrismaConnectorCredentialRepository,
  PrismaWorkflowSecretRepository,
} from './repositories';

@Module({
  imports: [RunlaneDatabaseModule, RunlaneWorkflowModule, RunlaneAuditModule, RunlaneCryptoModule],
  providers: [
    PrismaWorkflowSecretRepository,
    PrismaConnectorCredentialRepository,
    {
      provide: WORKFLOW_SECRET_REPOSITORY,
      useExisting: PrismaWorkflowSecretRepository,
    },
    {
      provide: CONNECTOR_CREDENTIAL_REPOSITORY,
      useExisting: PrismaConnectorCredentialRepository,
    },
    {
      provide: UpsertWorkflowSecretUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        WORKFLOW_SECRET_REPOSITORY,
        SECRET_CIPHER,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        secrets: WorkflowSecretRepositoryPort,
        cipher: SecretCipherPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new UpsertWorkflowSecretUseCase(workflows, secrets, cipher, auditLogs, transactionBoundary),
    },
    {
      provide: ListWorkflowSecretsUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_SECRET_REPOSITORY],
      useFactory: (workflows: WorkflowRepositoryPort, secrets: WorkflowSecretRepositoryPort) =>
        new ListWorkflowSecretsUseCase(workflows, secrets),
    },
    {
      provide: DeleteWorkflowSecretUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        WORKFLOW_SECRET_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        secrets: WorkflowSecretRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) => new DeleteWorkflowSecretUseCase(workflows, secrets, auditLogs, transactionBoundary),
    },
    {
      provide: UpsertConnectorCredentialUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        CONNECTOR_CREDENTIAL_REPOSITORY,
        SECRET_CIPHER,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        credentials: ConnectorCredentialRepositoryPort,
        cipher: SecretCipherPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new UpsertConnectorCredentialUseCase(
          workflows,
          credentials,
          cipher,
          auditLogs,
          transactionBoundary,
        ),
    },
    {
      provide: ListConnectorCredentialsUseCase,
      inject: [WORKFLOW_REPOSITORY, CONNECTOR_CREDENTIAL_REPOSITORY],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        credentials: ConnectorCredentialRepositoryPort,
      ) => new ListConnectorCredentialsUseCase(workflows, credentials),
    },
    {
      provide: DeleteConnectorCredentialUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        CONNECTOR_CREDENTIAL_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        workflows: WorkflowRepositoryPort,
        credentials: ConnectorCredentialRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new DeleteConnectorCredentialUseCase(
          workflows,
          credentials,
          auditLogs,
          transactionBoundary,
        ),
    },
  ],
  exports: [
    WORKFLOW_SECRET_REPOSITORY,
    CONNECTOR_CREDENTIAL_REPOSITORY,
    UpsertWorkflowSecretUseCase,
    ListWorkflowSecretsUseCase,
    DeleteWorkflowSecretUseCase,
    UpsertConnectorCredentialUseCase,
    ListConnectorCredentialsUseCase,
    DeleteConnectorCredentialUseCase,
  ],
})
export class RunlaneSecretsModule {}
