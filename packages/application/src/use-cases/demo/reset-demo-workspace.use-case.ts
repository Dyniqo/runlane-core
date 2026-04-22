import type { DemoResetResponseDto } from '@runlane/contracts';
import {
  DEMO_SEED_VERSION,
  assertDemoModeEnabled,
  demoWorkspaceRequired,
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
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildDemoResetResponse } from './demo-response';
import type { DemoResponseOptions } from './demo-response';
import { buildDemoWorkflowSeeds } from './demo-workflows';

export interface ResetDemoWorkspaceUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export interface ResetDemoWorkspaceUseCaseOptions {
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

export class ResetDemoWorkspaceUseCase implements UseCase<
  ResetDemoWorkspaceUseCaseInput,
  DemoResetResponseDto
> {
  constructor(
    private readonly demo: DemoRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly apiKeyTokens: ApiKeyTokenServicePort,
    private readonly transactionBoundary: TransactionBoundary,
    private readonly options: ResetDemoWorkspaceUseCaseOptions,
  ) {}

  execute(input: ResetDemoWorkspaceUseCaseInput): Promise<DemoResetResponseDto> {
    assertDemoModeEnabled(this.options.demoModeEnabled);
    const email = normalizeDemoUserEmail(this.options.demoUserEmail);
    const password = readDemoUserPassword(this.options.demoUserPassword);
    const name = normalizeDemoUserName(this.options.demoUserName);
    const workspaceName = normalizeDemoWorkspaceName(this.options.demoWorkspaceName);
    const apiKey = readDemoApiKey(this.options.demoApiKey);

    return this.transactionBoundary.execute(async () => {
      const workspaceState = await this.demo.findWorkspaceState(input.scope.workspaceId);

      if (!workspaceState?.isDemo) {
        throw demoWorkspaceRequired();
      }

      const passwordHash = await this.passwordHasher.hash(password);
      const keyHash = await this.apiKeyTokens.hash(apiKey.token);
      const record = await this.demo.reset({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
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
        resetAt: new Date(),
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildDemoResetResponse(
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
