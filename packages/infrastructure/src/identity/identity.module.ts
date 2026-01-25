import { Module } from '@nestjs/common';
import {
  AUTH_TOKEN_SERVICE,
  GetAuthenticatedUserUseCase,
  LoginUserUseCase,
  LogoutSessionUseCase,
  PASSWORD_HASHER,
  RefreshSessionUseCase,
  RegisterUserUseCase,
  SESSION_REPOSITORY,
  TRANSACTION_BOUNDARY,
  USER_REPOSITORY,
  WORKSPACE_REPOSITORY,
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
import { ScryptPasswordHasher } from './passwords/scrypt-password-hasher';
import { PrismaSessionRepository } from './repositories/prisma-session.repository';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { PrismaWorkspaceRepository } from './repositories/prisma-workspace.repository';
import { HmacAuthTokenService } from './tokens/hmac-auth-token.service';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    HmacAuthTokenService,
    ScryptPasswordHasher,
    PrismaSessionRepository,
    PrismaUserRepository,
    PrismaWorkspaceRepository,
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
  ],
  exports: [
    GetAuthenticatedUserUseCase,
    LoginUserUseCase,
    LogoutSessionUseCase,
    RefreshSessionUseCase,
    RegisterUserUseCase,
  ],
})
export class RunlaneIdentityModule {}
