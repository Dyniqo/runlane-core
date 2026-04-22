export interface DemoCredentialDto {
  readonly email: string;
  readonly password: string;
  readonly apiKey: string;
}

export interface DemoUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface DemoWorkspaceDto {
  readonly id: string;
  readonly name: string;
  readonly isDemo: true;
}

export interface DemoApiKeyDto {
  readonly id: string;
  readonly prefix: string;
  readonly name: string;
}

export interface DemoWorkflowDto {
  readonly id: string;
  readonly publicId: string;
  readonly name: string;
  readonly triggerType: string;
  readonly status: 'published';
  readonly version: number;
}

export interface DemoLimitsDto {
  readonly executionsPerHour: number;
  readonly aiCallsPerDay: number;
}

export interface DemoStateDto {
  readonly enabled: true;
  readonly seedVersion: string;
  readonly resetAt: string;
  readonly credentials: DemoCredentialDto;
  readonly user: DemoUserDto;
  readonly workspace: DemoWorkspaceDto;
  readonly apiKey: DemoApiKeyDto;
  readonly workflows: readonly DemoWorkflowDto[];
  readonly limits: DemoLimitsDto;
  readonly publicRegistrationEnabled: boolean;
}

export interface DemoSeedResponseDto {
  readonly demo: DemoStateDto;
}

export interface DemoResetResponseDto {
  readonly reset: true;
  readonly demo: DemoStateDto;
}
