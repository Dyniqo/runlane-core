import { Module } from '@nestjs/common';
import {
  API_KEY_TOKEN_SERVICE,
  DEMO_REPOSITORY,
  PASSWORD_HASHER,
  ResetDemoWorkspaceUseCase,
  SeedDemoWorkspaceUseCase,
  TRANSACTION_BOUNDARY,
} from '@runlane/application';
import type {
  ApiKeyTokenServicePort,
  DemoRepositoryPort,
  PasswordHasherPort,
  TransactionBoundary,
} from '@runlane/application';
import { RunlaneConfigModule, RuntimeConfigService } from '@runlane/config';
import { ScryptApiKeyTokenService } from '../access';
import { ScryptPasswordHasher } from '../identity';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaDemoRepository } from './repositories';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule],
  providers: [
    PrismaDemoRepository,
    ScryptPasswordHasher,
    ScryptApiKeyTokenService,
    {
      provide: DEMO_REPOSITORY,
      useExisting: PrismaDemoRepository,
    },
    {
      provide: PASSWORD_HASHER,
      useExisting: ScryptPasswordHasher,
    },
    {
      provide: API_KEY_TOKEN_SERVICE,
      useExisting: ScryptApiKeyTokenService,
    },
    {
      provide: SeedDemoWorkspaceUseCase,
      inject: [
        DEMO_REPOSITORY,
        PASSWORD_HASHER,
        API_KEY_TOKEN_SERVICE,
        TRANSACTION_BOUNDARY,
        RuntimeConfigService,
      ],
      useFactory: (
        demo: DemoRepositoryPort,
        passwordHasher: PasswordHasherPort,
        apiKeyTokens: ApiKeyTokenServicePort,
        transactionBoundary: TransactionBoundary,
        config: RuntimeConfigService,
      ) =>
        new SeedDemoWorkspaceUseCase(demo, passwordHasher, apiKeyTokens, transactionBoundary, {
          demoModeEnabled: config.demoModeEnabled,
          demoUserEmail: config.demoUserEmail,
          demoUserPassword: config.demoUserPassword,
          demoUserName: config.demoUserName,
          demoWorkspaceName: config.demoWorkspaceName,
          demoApiKey: config.demoApiKey,
          executionLimitPerHour: config.demoExecutionLimitPerHour,
          aiCallLimitPerDay: config.demoAiCallLimitPerDay,
          publicRegistrationEnabled: config.publicRegistrationEnabled,
        }),
    },
    {
      provide: ResetDemoWorkspaceUseCase,
      inject: [
        DEMO_REPOSITORY,
        PASSWORD_HASHER,
        API_KEY_TOKEN_SERVICE,
        TRANSACTION_BOUNDARY,
        RuntimeConfigService,
      ],
      useFactory: (
        demo: DemoRepositoryPort,
        passwordHasher: PasswordHasherPort,
        apiKeyTokens: ApiKeyTokenServicePort,
        transactionBoundary: TransactionBoundary,
        config: RuntimeConfigService,
      ) =>
        new ResetDemoWorkspaceUseCase(demo, passwordHasher, apiKeyTokens, transactionBoundary, {
          demoModeEnabled: config.demoModeEnabled,
          demoUserEmail: config.demoUserEmail,
          demoUserPassword: config.demoUserPassword,
          demoUserName: config.demoUserName,
          demoWorkspaceName: config.demoWorkspaceName,
          demoApiKey: config.demoApiKey,
          executionLimitPerHour: config.demoExecutionLimitPerHour,
          aiCallLimitPerDay: config.demoAiCallLimitPerDay,
          publicRegistrationEnabled: config.publicRegistrationEnabled,
        }),
    },
  ],
  exports: [DEMO_REPOSITORY, SeedDemoWorkspaceUseCase, ResetDemoWorkspaceUseCase],
})
export class RunlaneDemoModule {}
