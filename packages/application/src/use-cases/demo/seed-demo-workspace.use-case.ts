import type { DemoSeedResponseDto } from '@runlane/contracts';
import {
  DEMO_SEED_VERSION,
  assertDemoModeEnabled,
  normalizeDemoUserEmail,
  normalizeDemoUserName,
  normalizeDemoWorkspaceName,
  readDemoApiKey,
  readDemoUserPassword,
} from '@runlane/domain';
import type {
  ApiKeyTokenServicePort,
  DemoRepositoryPort,
  PasswordHasherPort,
  TransactionBoundary,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildDemoSeedResponse } from './demo-response';
import type { DemoResponseOptions } from './demo-response';
import { buildDemoWorkflowSeeds } from './demo-workflows';

export interface SeedDemoWorkspaceUseCaseInput {
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export interface SeedDemoWorkspaceUseCaseOptions {
  readonly demoModeEnabled: boolean;
  readonly demoUserEmail: string;
  readonly demoUserPassword: string;
  readonly demoUserName: string;
  readonly demoWorkspaceName: string;
  readonly demoApiKey: string;
  readonly executionLimitPerHour: number;
  readonly aiCallLimitPerDay: number;
  readonly publicRegistrationEnabled: boolean;
}

export class SeedDemoWorkspaceUseCase implements UseCase<
  SeedDemoWorkspaceUseCaseInput,
  DemoSeedResponseDto
> {
  constructor(
    private readonly demo: DemoRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly apiKeyTokens: ApiKeyTokenServicePort,
    private readonly transactionBoundary: TransactionBoundary,
    private readonly options: SeedDemoWorkspaceUseCaseOptions,
  ) {}

  execute(_input: SeedDemoWorkspaceUseCaseInput): Promise<DemoSeedResponseDto> {
    assertDemoModeEnabled(this.options.demoModeEnabled);
    const email = normalizeDemoUserEmail(this.options.demoUserEmail);
    const password = readDemoUserPassword(this.options.demoUserPassword);
    const name = normalizeDemoUserName(this.options.demoUserName);
    const workspaceName = normalizeDemoWorkspaceName(this.options.demoWorkspaceName);
    const apiKey = readDemoApiKey(this.options.demoApiKey);

    return this.transactionBoundary.execute(async () => {
      const passwordHash = await this.passwordHasher.hash(password);
      const keyHash = await this.apiKeyTokens.hash(apiKey.token);
      const record = await this.demo.seed({
        email,
        passwordHash,
        name,
        workspaceName,
        apiKey: {
          token: apiKey.token,
          prefix: apiKey.prefix,
          keyHash,
        },
        seedVersion: DEMO_SEED_VERSION,
        workflows: buildDemoWorkflowSeeds(),
        seededAt: new Date(),
      });

      return buildDemoSeedResponse(
        record,
        this.responseOptions({ email, password, apiKey: apiKey.token }),
      );
    });
  }

  private responseOptions(input: {
    readonly email: string;
    readonly password: string;
    readonly apiKey: string;
  }): DemoResponseOptions {
    return {
      demoUserEmail: input.email,
      demoUserPassword: input.password,
      demoApiKey: input.apiKey,
      executionLimitPerHour: this.options.executionLimitPerHour,
      aiCallLimitPerDay: this.options.aiCallLimitPerDay,
      publicRegistrationEnabled: this.options.publicRegistrationEnabled,
    };
  }
}
