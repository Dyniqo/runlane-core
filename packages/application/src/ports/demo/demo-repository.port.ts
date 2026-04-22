import type { JsonObject } from '@runlane/contracts';

export const DEMO_REPOSITORY = Symbol('DEMO_REPOSITORY');

export interface DemoWorkflowSeedInput {
  readonly publicId: string;
  readonly name: string;
  readonly triggerType: string;
  readonly definition: JsonObject;
}

export interface SeedDemoWorkspaceInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly workspaceName: string;
  readonly apiKey: {
    readonly token: string;
    readonly prefix: string;
    readonly keyHash: string;
  };
  readonly seedVersion: string;
  readonly workflows: readonly DemoWorkflowSeedInput[];
  readonly seededAt: Date;
}

export interface ResetDemoWorkspaceInput extends SeedDemoWorkspaceInput {
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly resetAt: Date;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface DemoWorkflowRecord {
  readonly id: string;
  readonly publicId: string;
  readonly name: string;
  readonly triggerType: string;
  readonly status: 'published';
  readonly version: number;
}

export interface DemoWorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly isDemo: true;
}

export interface DemoUserRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface DemoApiKeyRecord {
  readonly id: string;
  readonly prefix: string;
  readonly name: string;
}

export interface DemoSeedRecord {
  readonly user: DemoUserRecord;
  readonly workspace: DemoWorkspaceRecord;
  readonly apiKey: DemoApiKeyRecord;
  readonly workflows: readonly DemoWorkflowRecord[];
  readonly seedVersion: string;
  readonly resetAt: Date;
}

export interface DemoWorkspaceStateRecord {
  readonly workspaceId: string;
  readonly isDemo: boolean;
}

export interface DemoUsageQuantityInput {
  readonly workspaceId: string;
  readonly type: 'execution' | 'ai_call';
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

export interface DemoRepositoryPort {
  seed(input: SeedDemoWorkspaceInput): Promise<DemoSeedRecord>;
  reset(input: ResetDemoWorkspaceInput): Promise<DemoSeedRecord>;
  findWorkspaceState(workspaceId: string): Promise<DemoWorkspaceStateRecord | null>;
  countUsage(input: DemoUsageQuantityInput): Promise<number>;
}
