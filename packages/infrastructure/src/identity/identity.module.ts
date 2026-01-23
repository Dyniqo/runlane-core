import { Module } from '@nestjs/common';
import {
  PASSWORD_HASHER,
  RegisterUserUseCase,
  TRANSACTION_BOUNDARY,
  USER_REPOSITORY,
  WORKSPACE_REPOSITORY,
} from '@runlane/application';
import type {
  PasswordHasherPort,
  TransactionBoundary,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '@runlane/application';
import { RunlaneDatabaseModule } from '../prisma';
import { ScryptPasswordHasher } from './passwords/scrypt-password-hasher';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { PrismaWorkspaceRepository } from './repositories/prisma-workspace.repository';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    ScryptPasswordHasher,
    PrismaUserRepository,
    PrismaWorkspaceRepository,
    {
      provide: PASSWORD_HASHER,
      useExisting: ScryptPasswordHasher,
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
  ],
  exports: [RegisterUserUseCase],
})
export class RunlaneIdentityModule {}
