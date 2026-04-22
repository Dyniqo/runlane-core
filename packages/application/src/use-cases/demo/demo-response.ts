import type { DemoResetResponseDto, DemoSeedResponseDto } from '@runlane/contracts';
import type { DemoSeedRecord } from '../../ports';

export interface DemoResponseOptions {
  readonly demoUserEmail: string;
  readonly demoUserPassword: string;
  readonly demoApiKey: string;
  readonly executionLimitPerHour: number;
  readonly aiCallLimitPerDay: number;
  readonly publicRegistrationEnabled: boolean;
}

export function buildDemoSeedResponse(
  record: DemoSeedRecord,
  options: DemoResponseOptions,
): DemoSeedResponseDto {
  return {
    demo: buildDemoState(record, options),
  };
}

export function buildDemoResetResponse(
  record: DemoSeedRecord,
  options: DemoResponseOptions,
): DemoResetResponseDto {
  return {
    reset: true,
    demo: buildDemoState(record, options),
  };
}

function buildDemoState(
  record: DemoSeedRecord,
  options: DemoResponseOptions,
): DemoSeedResponseDto['demo'] {
  return {
    enabled: true,
    seedVersion: record.seedVersion,
    resetAt: record.resetAt.toISOString(),
    credentials: {
      email: options.demoUserEmail,
      password: options.demoUserPassword,
      apiKey: options.demoApiKey,
    },
    user: record.user,
    workspace: record.workspace,
    apiKey: record.apiKey,
    workflows: record.workflows,
    limits: {
      executionsPerHour: options.executionLimitPerHour,
      aiCallsPerDay: options.aiCallLimitPerDay,
    },
    publicRegistrationEnabled: options.publicRegistrationEnabled,
  };
}
