import { Module } from '@nestjs/common';
import { RunlaneConfigModule, RuntimeConfigService } from '@runlane/config';
import {
  AUDIT_LOG_REPOSITORY,
  AUTH_TOKEN_SERVICE,
  DEMO_REPOSITORY,
  GetAuthenticatedUserUseCase,
  GetCurrentWorkspaceUseCase,
  ListWorkspacesUseCase,
  LoginUserUseCase,
  LogoutSessionUseCase,
  PASSWORD_HASHER,
  RefreshSessionUseCase,
  RegisterUserUseCase,
  SESSION_REPOSITORY,
  TRANSACTION_BOUNDARY,
  UpdateCurrentWorkspaceUseCase,
  USER_REPOSITORY,
  WORKSPACE_REPOSITORY,
  WORKSPACE_SCOPE_RESOLVER,
} from '@runlane/application';
import type {
  AuditLogRepositoryPort,
  AuthTokenServicePort,
  DemoRepositoryPort,
  PasswordHasherPort,
  SessionRepositoryPort,
  TransactionBoundary,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '@runlane/application';
import { RunlaneAuditModule } from '../audit';
import { PrismaDemoRepository } from '../demo/repositories';
import { RunlaneDatabaseModule } from '../prisma';
import { WorkspaceTenantGuard } from './guards';
import { ScryptPasswordHasher } from './passwords/scrypt-password-hasher';
import { PrismaSessionRepository } from './repositories/prisma-session.repository';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { PrismaWorkspaceRepository } from './repositories/prisma-workspace.repository';
import { DefaultWorkspaceScopeResolver } from './scope';
import { HmacAuthTokenService } from './tokens/hmac-auth-token.service';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule, RunlaneAuditModule],
  providers: [
    HmacAuthTokenService,
    ScryptPasswordHasher,
    PrismaSessionRepository,
    PrismaUserRepository,
    PrismaWorkspaceRepository,
    PrismaDemoRepository,
    DefaultWorkspaceScopeResolver,
    WorkspaceTenantGuard,
    {
      provide: AUTH_TOKEN_SERVICE,
      useExisting: HmacAuthTokenService,
    },
    {
      provide: PASSWORD_HASHER,
      useExisting: ScryptPasswordHasher,
    },
    {
      provide: SESSION_REPOSITORY,
      useExisting: PrismaSessionRepository,
    },
    {
      provide: USER_REPOSITORY,
      useExisting: PrismaUserRepository,
    },
    {
      provide: WORKSPACE_REPOSITORY,
      useExisting: PrismaWorkspaceRepository,
    },
    {
      provide: DEMO_REPOSITORY,
      useExisting: PrismaDemoRepository,
    },
    {
      provide: WORKSPACE_SCOPE_RESOLVER,
      useExisting: DefaultWorkspaceScopeResolver,
    },
    {
      provide: RegisterUserUseCase,
      inject: [
        USER_REPOSITORY,
        WORKSPACE_REPOSITORY,
        PASSWORD_HASHER,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
        RuntimeConfigService,
      ],
      useFactory: (
        users: UserRepositoryPort,
        workspaces: WorkspaceRepositoryPort,
        passwordHasher: PasswordHasherPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
        config: RuntimeConfigService,
      ) =>
        new RegisterUserUseCase(users, workspaces, passwordHasher, auditLogs, transactionBoundary, {
          publicRegistrationEnabled: config.publicRegistrationEnabled,
        }),
    },
    {
      provide: LoginUserUseCase,
      inject: [
        USER_REPOSITORY,
        WORKSPACE_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHER,
        AUTH_TOKEN_SERVICE,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
        DEMO_REPOSITORY,
        RuntimeConfigService,
      ],
      useFactory: (
        users: UserRepositoryPort,
        workspaces: WorkspaceRepositoryPort,
        sessions: SessionRepositoryPort,
        passwordHasher: PasswordHasherPort,
        tokens: AuthTokenServicePort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
        demo: DemoRepositoryPort,
        config: RuntimeConfigService,
      ) =>
        new LoginUserUseCase(
          users,
          workspaces,
          sessions,
          passwordHasher,
          tokens,
          auditLogs,
          transactionBoundary,
          demo,
          {
            demoModeEnabled: config.demoModeEnabled,
            demoSessionEnabled: config.demoSessionEnabled,
            demoUserEmail: config.demoUserEmail,
            demoSessionTtlHours: config.demoSessionTtlHours,
            demoMaxSessionsPerIpPerHour: config.demoMaxSessionsPerIpPerHour,
          },
        ),
    },
    {
      provide: RefreshSessionUseCase,
      inject: [
        USER_REPOSITORY,
        WORKSPACE_REPOSITORY,
        SESSION_REPOSITORY,
        AUTH_TOKEN_SERVICE,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        users: UserRepositoryPort,
        workspaces: WorkspaceRepositoryPort,
        sessions: SessionRepositoryPort,
        tokens: AuthTokenServicePort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new RefreshSessionUseCase(
          users,
          workspaces,
          sessions,
          tokens,
          auditLogs,
          transactionBoundary,
        ),
    },
    {
      provide: LogoutSessionUseCase,
      inject: [
        SESSION_REPOSITORY,
        AUTH_TOKEN_SERVICE,
        WORKSPACE_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        sessions: SessionRepositoryPort,
        tokens: AuthTokenServicePort,
        workspaces: WorkspaceRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) => new LogoutSessionUseCase(sessions, tokens, workspaces, auditLogs, transactionBoundary),
    },
    {
      provide: GetAuthenticatedUserUseCase,
      inject: [USER_REPOSITORY, WORKSPACE_REPOSITORY, SESSION_REPOSITORY, AUTH_TOKEN_SERVICE],
      useFactory: (
        users: UserRepositoryPort,
        workspaces: WorkspaceRepositoryPort,
        sessions: SessionRepositoryPort,
        tokens: AuthTokenServicePort,
      ) => new GetAuthenticatedUserUseCase(users, workspaces, sessions, tokens),
    },
    {
      provide: ListWorkspacesUseCase,
      inject: [WORKSPACE_REPOSITORY],
      useFactory: (workspaces: WorkspaceRepositoryPort) => new ListWorkspacesUseCase(workspaces),
    },
    {
      provide: GetCurrentWorkspaceUseCase,
      inject: [WORKSPACE_REPOSITORY],
      useFactory: (workspaces: WorkspaceRepositoryPort) =>
        new GetCurrentWorkspaceUseCase(workspaces),
    },
    {
      provide: UpdateCurrentWorkspaceUseCase,
      inject: [WORKSPACE_REPOSITORY, AUDIT_LOG_REPOSITORY, TRANSACTION_BOUNDARY],
      useFactory: (
        workspaces: WorkspaceRepositoryPort,
        auditLogs: AuditLogRepositoryPort,
        transactionBoundary: TransactionBoundary,
      ) => new UpdateCurrentWorkspaceUseCase(workspaces, auditLogs, transactionBoundary),
    },
  ],
  exports: [
    GetAuthenticatedUserUseCase,
    GetCurrentWorkspaceUseCase,
    ListWorkspacesUseCase,
    LoginUserUseCase,
    LogoutSessionUseCase,
    RefreshSessionUseCase,
    RegisterUserUseCase,
    UpdateCurrentWorkspaceUseCase,
    WorkspaceTenantGuard,
    WORKSPACE_SCOPE_RESOLVER,
  ],
})
export class RunlaneIdentityModule {}
