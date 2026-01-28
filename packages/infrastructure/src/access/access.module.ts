import { Module } from '@nestjs/common';
import {
  API_KEY_REPOSITORY,
  API_KEY_TOKEN_SERVICE,
  CreateApiKeyUseCase,
  ListApiKeysUseCase,
  ResolveApiKeyUseCase,
  RevokeApiKeyUseCase,
  TRANSACTION_BOUNDARY,
} from '@runlane/application';
import type {
  ApiKeyRepositoryPort,
  ApiKeyTokenServicePort,
  TransactionBoundary,
} from '@runlane/application';
import { RunlaneDatabaseModule } from '../prisma';
import { ApiKeyGuard } from './guards';
import { PrismaApiKeyRepository } from './repositories';
import { ScryptApiKeyTokenService } from './tokens';

@Module({
  imports: [RunlaneDatabaseModule],
  providers: [
    ScryptApiKeyTokenService,
    PrismaApiKeyRepository,
    ApiKeyGuard,
    {
      provide: API_KEY_TOKEN_SERVICE,
      useExisting: ScryptApiKeyTokenService,
    },
    {
      provide: API_KEY_REPOSITORY,
      useExisting: PrismaApiKeyRepository,
    },
    {
      provide: CreateApiKeyUseCase,
      inject: [API_KEY_REPOSITORY, API_KEY_TOKEN_SERVICE, TRANSACTION_BOUNDARY],
      useFactory: (
        apiKeys: ApiKeyRepositoryPort,
        apiKeyTokens: ApiKeyTokenServicePort,
        transactionBoundary: TransactionBoundary,
      ) => new CreateApiKeyUseCase(apiKeys, apiKeyTokens, transactionBoundary),
    },
    {
      provide: ListApiKeysUseCase,
      inject: [API_KEY_REPOSITORY],
      useFactory: (apiKeys: ApiKeyRepositoryPort) => new ListApiKeysUseCase(apiKeys),
    },
    {
      provide: ResolveApiKeyUseCase,
      inject: [API_KEY_REPOSITORY, API_KEY_TOKEN_SERVICE],
      useFactory: (apiKeys: ApiKeyRepositoryPort, apiKeyTokens: ApiKeyTokenServicePort) =>
        new ResolveApiKeyUseCase(apiKeys, apiKeyTokens),
    },
    {
      provide: RevokeApiKeyUseCase,
      inject: [API_KEY_REPOSITORY],
      useFactory: (apiKeys: ApiKeyRepositoryPort) => new RevokeApiKeyUseCase(apiKeys),
    },
  ],
  exports: [
    ApiKeyGuard,
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    ResolveApiKeyUseCase,
    RevokeApiKeyUseCase,
  ],
})
export class RunlaneAccessModule {}
