import { Module } from '@nestjs/common';
import {
  AUTH_TOKEN_SERVICE,
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
  AuthTokenServicePort,
  PasswordHasherPort,
  SessionRepositoryPort,
  TransactionBoundary,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '@runlane/application';
import { RunlaneDatabaseModule } from '../prisma';
import { WorkspaceTenantGuard } from './guards';
import { ScryptPasswordHasher } from './passwords/scrypt-password-hasher';
import { PrismaSessionRepository } from './repositories/prisma-session.repository';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { PrismaWorkspaceRepository } from './repositories/prisma-workspace.repository';
import { DefaultWorkspaceScopeResolver } from './scope';
import { HmacAuthTokenService } from './tokens/hmac-auth-token.service';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    HmacAuthTokenService,
    ScryptPasswordHasher,
    PrismaSessionRepository,
    PrismaUserRepository,
    PrismaWorkspaceRepository,
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
      provide: WORKSPACE_SCOPE_RESOLVER,
      useExisting: DefaultWorkspaceScopeResolver,
    },
    {
      provide: RegisterUserUseCase,
      inject: [USER_REPOSITORY, WORKSPACE_REPOSITORY, PASSWORD_HASHER, TRANSACTION_BOUNDARY],
      useFactory: (
        users: UserRepositoryPort,
        workspaces: WorkspaceRepositoryPort,
        passwordHasher: PasswordHasherPort,
        transactionBoundary: TransactionBoundary,
      ) => new RegisterUserUseCase(users, workspaces, passwordHasher, transactionBoundary),
    },
    {
      provide: LoginUserUseCase,
      inject: [
        USER_REPOSITORY,
        WORKSPACE_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHER,
        AUTH_TOKEN_SERVICE,
        TRANSACTION_BOUNDARY,
      ],
      useFactory: (
        users: UserRepositoryPort,
        workspaces: WorkspaceRepositoryPort,
        sessions: SessionRepositoryPort,
        passwordHasher: PasswordHasherPort,
        tokens: AuthTokenServicePort,
        transactionBoundary: TransactionBoundary,
      ) =>
        new LoginUserUseCase(
          users,
          workspaces,
          sessions,
          passwordHasher,
          tokens,
          transactionBoundary,
        ),
    },
    {
      provide: RefreshSessionUseCase,
      inject: [USER_REPOSITORY, WORKSPACE_REPOSITORY, SESSION_REPOSITORY, AUTH_TOKEN_SERVICE],
      useFactory: (
        users: UserRepositoryPort,
        workspaces: WorkspaceRepositoryPort,
        sessions: SessionRepositoryPort,
        tokens: AuthTokenServicePort,
      ) => new RefreshSessionUseCase(users, workspaces, sessions, tokens),
    },
    {
      provide: LogoutSessionUseCase,
      inject: [SESSION_REPOSITORY, AUTH_TOKEN_SERVICE],
      useFactory: (sessions: SessionRepositoryPort, tokens: AuthTokenServicePort) =>
        new LogoutSessionUseCase(sessions, tokens),
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
      inject: [WORKSPACE_REPOSITORY],
      useFactory: (workspaces: WorkspaceRepositoryPort) =>
        new UpdateCurrentWorkspaceUseCase(workspaces),
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
