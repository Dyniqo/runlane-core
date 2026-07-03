import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CleanupExpiredDemoSessionsInput,
  DemoRepositoryPort,
  DemoSeedRecord,
  DemoSessionCleanupRecord,
  DemoSessionWorkspaceRecord,
  DemoUsageQuantityInput,
  DemoWorkflowRecord,
  DemoWorkspaceStateRecord,
  ResetDemoWorkspaceInput,
  ResolveDemoSessionWorkspaceInput,
  SeedDemoWorkspaceInput,
} from '@runlane/application';
import { demoSeedWorkspaceMissing, demoSessionLimitExceeded } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

const DEMO_API_KEY_NAME = 'Demo automation key';
const DEMO_AUDIT_ENTITY_TYPE = 'demo';
const DEMO_SESSION_PUBLIC_ID_HEX_LENGTH = 32;
const DEMO_SESSION_PUBLIC_ID_INDEX_HEX_LENGTH = 2;
const SESSION_RATE_WINDOW_MS = 60 * 60 * 1000;
const DEMO_BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class PrismaDemoRepository implements DemoRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async seed(input: SeedDemoWorkspaceInput): Promise<DemoSeedRecord> {
    const user = await this.upsertDemoUser(input);
    const workspace = await this.upsertDemoWorkspace(input, user.id);

    await this.upsertDemoMembership(workspace.id, user.id);

    const [apiKey, workflows] = await Promise.all([
      this.upsertDemoApiKey(input, workspace.id),
      this.upsertDemoWorkflows(input, workspace.id),
    ]);

    const demoState = await this.persistence.client.demoState.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        seedVersion: input.seedVersion,
        resetAt: input.seededAt,
      },
      update: {
        seedVersion: input.seedVersion,
        resetAt: input.seededAt,
      },
      select: {
        seedVersion: true,
        resetAt: true,
      },
    });

    await this.persistence.client.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: 'demo.seeded',
        entityType: DEMO_AUDIT_ENTITY_TYPE,
        entityId: workspace.id,
        metadataJson: {
          seedVersion: input.seedVersion,
          workflowPublicIds: input.workflows.map((workflow) => workflow.publicId),
        } as Prisma.InputJsonValue,
      },
    });

    return {
      user,
      workspace,
      apiKey,
      workflows,
      seedVersion: demoState.seedVersion,
      resetAt: demoState.resetAt,
    };
  }

  async reset(input: ResetDemoWorkspaceInput): Promise<DemoSeedRecord> {
    const workspace = await this.persistence.client.workspace.findFirst({
      where: {
        id: input.workspaceId,
        isDemo: true,
      },
      select: {
        id: true,
        ownerId: true,
        demoSessionId: true,
      },
    });

    if (!workspace) {
      throw new TypeError('Demo workspace reset requires an existing demo workspace');
    }

    const record = workspace.demoSessionId
      ? await this.resetSessionWorkspace(input, workspace.ownerId, workspace.demoSessionId)
      : await this.resetSeedWorkspace(input);

    await this.persistence.client.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: 'demo.reset',
        entityType: DEMO_AUDIT_ENTITY_TYPE,
        entityId: input.workspaceId,
        metadataJson: {
          seedVersion: input.seedVersion,
          ip: input.ip ?? '',
          userAgent: input.userAgent ?? '',
          sessionScoped: workspace.demoSessionId !== null,
        } as Prisma.InputJsonValue,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    return record;
  }

  async resolveSessionWorkspace(
    input: ResolveDemoSessionWorkspaceInput,
  ): Promise<DemoSessionWorkspaceRecord> {
    await this.cleanupExpiredSessions({ now: input.now, limit: 250 });

    const existing = await this.persistence.client.demoSession.findUnique({
      where: { sessionKeyHash: input.sessionKeyHash },
      select: demoSessionWorkspaceSelect,
    });

    if (
      existing &&
      existing.revokedAt === null &&
      existing.expiresAt.getTime() > input.now.getTime()
    ) {
      const updated = await this.persistence.client.demoSession.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: input.now,
          expiresAt: input.expiresAt,
          ipHash: input.ipHash,
          userAgentHash: input.userAgentHash,
        },
        select: demoSessionWorkspaceSelect,
      });

      return mapDemoSessionWorkspace(updated);
    }

    if (existing) {
      await this.persistence.client.workspace.deleteMany({
        where: {
          id: existing.workspaceId,
          isDemo: true,
          demoSessionId: input.sessionKeyHash,
        },
      });
    }

    if (input.ipHash) {
      const used = await this.persistence.client.demoSession.count({
        where: {
          ipHash: input.ipHash,
          createdAt: {
            gte: new Date(input.now.getTime() - SESSION_RATE_WINDOW_MS),
          },
        },
      });

      if (used >= input.maxSessionsPerIpPerHour) {
        throw demoSessionLimitExceeded({
          used,
          limit: input.maxSessionsPerIpPerHour,
          window: 'hour',
        });
      }
    }

    const seed = await this.findSeedWorkspace(input.ownerId);

    if (!seed) {
      throw demoSeedWorkspaceMissing();
    }

    const workspace = await this.persistence.client.workspace.create({
      data: {
        name: seed.workspace.name,
        ownerId: input.ownerId,
        isDemo: true,
        demoSessionId: input.sessionKeyHash,
        plan: seed.workspace.plan,
        billingStatus: seed.workspace.billingStatus,
        billingCurrentPeriodStart: seed.workspace.billingCurrentPeriodStart,
        billingCurrentPeriodEnd: seed.workspace.billingCurrentPeriodEnd,
        members: {
          create: {
            userId: input.ownerId,
            role: 'OWNER',
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    await this.copySeedStateToWorkspace({
      seedWorkspaceId: seed.workspace.id,
      targetWorkspaceId: workspace.id,
      sessionKeyHash: input.sessionKeyHash,
      now: input.now,
    });

    await this.persistence.client.demoState.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        seedVersion: input.seedVersion,
        resetAt: input.now,
      },
      update: {
        seedVersion: input.seedVersion,
        resetAt: input.now,
      },
    });

    const demoSession = await this.persistence.client.demoSession.create({
      data: {
        sessionKeyHash: input.sessionKeyHash,
        workspaceId: workspace.id,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        expiresAt: input.expiresAt,
        lastSeenAt: input.now,
      },
      select: demoSessionWorkspaceSelect,
    });

    await this.persistence.client.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: input.ownerId,
        action: 'demo.session_workspace_created',
        entityType: DEMO_AUDIT_ENTITY_TYPE,
        entityId: workspace.id,
        metadataJson: {
          seedWorkspaceId: seed.workspace.id,
          seedVersion: input.seedVersion,
          expiresAt: input.expiresAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return mapDemoSessionWorkspace(demoSession);
  }

  async cleanupExpiredSessions(
    input: CleanupExpiredDemoSessionsInput,
  ): Promise<DemoSessionCleanupRecord> {
    const expiredSessions = await this.persistence.client.demoSession.findMany({
      where: {
        OR: [{ expiresAt: { lte: input.now } }, { revokedAt: { not: null } }],
      },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
      select: {
        workspaceId: true,
      },
    });

    const workspaceIds = Array.from(new Set(expiredSessions.map((session) => session.workspaceId)));

    if (workspaceIds.length === 0) {
      return { sessionsDeleted: 0, workspacesDeleted: 0 };
    }

    const deletedWorkspaces = await this.persistence.client.workspace.deleteMany({
      where: {
        id: { in: workspaceIds },
        isDemo: true,
        demoSessionId: { not: null },
      },
    });

    return {
      sessionsDeleted: expiredSessions.length,
      workspacesDeleted: deletedWorkspaces.count,
    };
  }

  async findWorkspaceState(workspaceId: string): Promise<DemoWorkspaceStateRecord | null> {
    const workspace = await this.persistence.client.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        isDemo: true,
      },
    });

    return workspace
      ? {
          workspaceId: workspace.id,
          isDemo: workspace.isDemo,
        }
      : null;
  }

  async countUsage(input: DemoUsageQuantityInput): Promise<number> {
    const result = await this.persistence.client.usageRecord.aggregate({
      where: {
        workspaceId: input.workspaceId,
        type: mapUsageMetricType(input.type),
        createdAt: {
          gte: input.periodStart,
          lt: input.periodEnd,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    return result._sum.quantity ?? 0;
  }

  private async resetSeedWorkspace(input: ResetDemoWorkspaceInput): Promise<DemoSeedRecord> {
    await this.deleteDemoMutableState(input.workspaceId);

    return this.seed({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      workspaceName: input.workspaceName,
      apiKey: input.apiKey,
      seedVersion: input.seedVersion,
      workflows: input.workflows,
      seededAt: input.resetAt,
    });
  }

  private async resetSessionWorkspace(
    input: ResetDemoWorkspaceInput,
    ownerId: string,
    sessionKeyHash: string,
  ): Promise<DemoSeedRecord> {
    const seed = await this.findSeedWorkspace(ownerId);

    if (!seed) {
      throw demoSeedWorkspaceMissing();
    }

    await this.deleteDemoMutableState(input.workspaceId);

    const workflows = await this.copySeedStateToWorkspace({
      seedWorkspaceId: seed.workspace.id,
      targetWorkspaceId: input.workspaceId,
      sessionKeyHash,
      now: input.resetAt,
    });

    const workspace = await this.persistence.client.workspace.update({
      where: { id: input.workspaceId },
      data: {
        name: input.workspaceName,
        plan: seed.workspace.plan,
        billingStatus: seed.workspace.billingStatus,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingCurrentPeriodStart: seed.workspace.billingCurrentPeriodStart,
        billingCurrentPeriodEnd: seed.workspace.billingCurrentPeriodEnd,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const demoState = await this.persistence.client.demoState.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        seedVersion: input.seedVersion,
        resetAt: input.resetAt,
      },
      update: {
        seedVersion: input.seedVersion,
        resetAt: input.resetAt,
      },
      select: {
        seedVersion: true,
        resetAt: true,
      },
    });

    return {
      user: seed.user,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        isDemo: true,
      },
      apiKey: seed.apiKey,
      workflows,
      seedVersion: demoState.seedVersion,
      resetAt: demoState.resetAt,
    };
  }

  private async upsertDemoUser(input: SeedDemoWorkspaceInput) {
    return this.persistence.client.user.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
      },
      update: {
        passwordHash: input.passwordHash,
        name: input.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  }

  private async upsertDemoWorkspace(
    input: SeedDemoWorkspaceInput,
    ownerId: string,
  ): Promise<{ readonly id: string; readonly name: string; readonly isDemo: true }> {
    const current = await this.persistence.client.workspace.findFirst({
      where: {
        ownerId,
        isDemo: true,
        demoSessionId: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
      },
    });

    const workspace = current
      ? await this.persistence.client.workspace.update({
          where: { id: current.id },
          data: {
            name: input.workspaceName,
            ownerId,
            isDemo: true,
            demoSessionId: null,
            plan: 'PRO',
            billingStatus: 'ACTIVE',
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            billingCurrentPeriodStart: input.seededAt,
            billingCurrentPeriodEnd: buildDemoBillingPeriodEnd(input.seededAt),
          },
          select: {
            id: true,
            name: true,
          },
        })
      : await this.persistence.client.workspace.create({
          data: {
            name: input.workspaceName,
            ownerId,
            isDemo: true,
            demoSessionId: null,
            plan: 'PRO',
            billingStatus: 'ACTIVE',
            billingCurrentPeriodStart: input.seededAt,
            billingCurrentPeriodEnd: buildDemoBillingPeriodEnd(input.seededAt),
          },
          select: {
            id: true,
            name: true,
          },
        });

    return {
      id: workspace.id,
      name: workspace.name,
      isDemo: true,
    };
  }

  private async upsertDemoMembership(workspaceId: string, userId: string): Promise<void> {
    await this.persistence.client.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      create: {
        workspaceId,
        userId,
        role: 'OWNER',
      },
      update: {
        role: 'OWNER',
      },
    });
  }

  private async upsertDemoApiKey(input: SeedDemoWorkspaceInput, workspaceId: string) {
    return this.persistence.client.apiKey.upsert({
      where: { prefix: input.apiKey.prefix },
      create: {
        workspaceId,
        name: DEMO_API_KEY_NAME,
        prefix: input.apiKey.prefix,
        keyHash: input.apiKey.keyHash,
        revokedAt: null,
      },
      update: {
        workspaceId,
        name: DEMO_API_KEY_NAME,
        keyHash: input.apiKey.keyHash,
        revokedAt: null,
        lastUsedAt: null,
      },
      select: {
        id: true,
        prefix: true,
        name: true,
      },
    });
  }

  private async upsertDemoWorkflows(input: SeedDemoWorkspaceInput, workspaceId: string) {
    const workflows: DemoWorkflowRecord[] = [];

    for (const workflow of input.workflows) {
      const record = await this.persistence.client.workflow.upsert({
        where: { publicId: workflow.publicId },
        create: {
          workspaceId,
          publicId: workflow.publicId,
          name: workflow.name,
          status: 'PUBLISHED',
          version: 1,
          definitionJson: workflow.definition as Prisma.InputJsonValue,
          triggerType: workflow.triggerType,
          publishedAt: input.seededAt,
        },
        update: {
          workspaceId,
          name: workflow.name,
          status: 'PUBLISHED',
          version: 1,
          definitionJson: workflow.definition as Prisma.InputJsonValue,
          triggerType: workflow.triggerType,
          publishedAt: input.seededAt,
        },
        select: workflowSeedSelect,
      });

      workflows.push(mapDemoWorkflow(record));
    }

    return workflows;
  }

  private async findSeedWorkspace(ownerId: string) {
    const workspace = await this.persistence.client.workspace.findFirst({
      where: {
        ownerId,
        isDemo: true,
        demoSessionId: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        plan: true,
        billingStatus: true,
        billingCurrentPeriodStart: true,
        billingCurrentPeriodEnd: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        apiKeys: {
          where: { revokedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 1,
          select: {
            id: true,
            prefix: true,
            name: true,
          },
        },
      },
    });

    if (!workspace) {
      return null;
    }

    const apiKey = workspace.apiKeys[0] ?? {
      id: '',
      prefix: '',
      name: DEMO_API_KEY_NAME,
    };

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        isDemo: true as const,
        plan: workspace.plan,
        billingStatus: workspace.billingStatus,
        billingCurrentPeriodStart: workspace.billingCurrentPeriodStart,
        billingCurrentPeriodEnd: workspace.billingCurrentPeriodEnd,
      },
      user: workspace.owner,
      apiKey,
    };
  }

  private async copySeedStateToWorkspace(input: {
    readonly seedWorkspaceId: string;
    readonly targetWorkspaceId: string;
    readonly sessionKeyHash: string;
    readonly now: Date;
  }): Promise<readonly DemoWorkflowRecord[]> {
    const seedWorkflows = await this.persistence.client.workflow.findMany({
      where: { workspaceId: input.seedWorkspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        triggerType: true,
        definitionJson: true,
        version: true,
        status: true,
        publishedAt: true,
      },
    });

    const workflowIdMap = new Map<string, string>();
    const workflows: DemoWorkflowRecord[] = [];

    for (const [index, workflow] of seedWorkflows.entries()) {
      const created = await this.persistence.client.workflow.create({
        data: {
          workspaceId: input.targetWorkspaceId,
          publicId: buildSessionWorkflowPublicId(input.sessionKeyHash, index),
          name: workflow.name,
          status: workflow.status,
          version: workflow.version,
          definitionJson: workflow.definitionJson as Prisma.InputJsonValue,
          triggerType: workflow.triggerType,
          publishedAt: workflow.publishedAt ?? input.now,
        },
        select: workflowSeedSelect,
      });

      workflowIdMap.set(workflow.id, created.id);
      workflows.push(mapDemoWorkflow(created));
    }

    await this.copyWorkflowSecrets(input.seedWorkspaceId, input.targetWorkspaceId, workflowIdMap);
    await this.copyConnectorCredentials(
      input.seedWorkspaceId,
      input.targetWorkspaceId,
      workflowIdMap,
    );

    return workflows;
  }

  private async copyWorkflowSecrets(
    seedWorkspaceId: string,
    targetWorkspaceId: string,
    workflowIdMap: ReadonlyMap<string, string>,
  ): Promise<void> {
    const secrets = await this.persistence.client.workflowSecret.findMany({
      where: { workspaceId: seedWorkspaceId },
      select: {
        workflowId: true,
        key: true,
        encryptedValue: true,
      },
    });

    if (secrets.length === 0) {
      return;
    }

    const data = secrets.flatMap((secret) => {
      const workflowId = workflowIdMap.get(secret.workflowId);

      return workflowId
        ? [
            {
              workspaceId: targetWorkspaceId,
              workflowId,
              key: secret.key,
              encryptedValue: secret.encryptedValue,
            },
          ]
        : [];
    });

    if (data.length === 0) {
      return;
    }

    await this.persistence.client.workflowSecret.createMany({ data });
  }

  private async copyConnectorCredentials(
    seedWorkspaceId: string,
    targetWorkspaceId: string,
    workflowIdMap: ReadonlyMap<string, string>,
  ): Promise<void> {
    const credentials = await this.persistence.client.connectorCredential.findMany({
      where: { workspaceId: seedWorkspaceId },
      select: {
        workflowId: true,
        name: true,
        type: true,
        encryptedValue: true,
        metadataJson: true,
      },
    });

    if (credentials.length === 0) {
      return;
    }

    const data = credentials.flatMap((credential) => {
      const workflowId = workflowIdMap.get(credential.workflowId);

      return workflowId
        ? [
            {
              workspaceId: targetWorkspaceId,
              workflowId,
              name: credential.name,
              type: credential.type,
              encryptedValue: credential.encryptedValue,
              metadataJson: credential.metadataJson as Prisma.InputJsonValue,
            },
          ]
        : [];
    });

    if (data.length === 0) {
      return;
    }

    await this.persistence.client.connectorCredential.createMany({ data });
  }

  private async deleteDemoMutableState(workspaceId: string): Promise<void> {
    await this.persistence.client.executionStep.deleteMany({ where: { workspaceId } });
    await this.persistence.client.execution.deleteMany({ where: { workspaceId } });
    await this.persistence.client.webhookRequest.deleteMany({ where: { workspaceId } });
    await this.persistence.client.usageRecord.deleteMany({ where: { workspaceId } });
    await this.persistence.client.workflowSecret.deleteMany({ where: { workspaceId } });
    await this.persistence.client.connectorCredential.deleteMany({ where: { workspaceId } });
    await this.persistence.client.billingEvent.deleteMany({ where: { workspaceId } });
    await this.persistence.client.auditLog.deleteMany({ where: { workspaceId } });
    await this.persistence.client.workflow.deleteMany({ where: { workspaceId } });
  }
}

const workflowSeedSelect = {
  id: true,
  publicId: true,
  name: true,
  triggerType: true,
  status: true,
  version: true,
} as const;

const demoSessionWorkspaceSelect = {
  id: true,
  sessionKeyHash: true,
  workspaceId: true,
  expiresAt: true,
  revokedAt: true,
  workspace: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

interface PrismaDemoWorkflowRecord {
  readonly id: string;
  readonly publicId: string;
  readonly name: string;
  readonly triggerType: string;
  readonly status: string;
  readonly version: number;
}

interface PrismaDemoSessionWorkspaceRecord {
  readonly id: string;
  readonly sessionKeyHash: string;
  readonly workspaceId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly workspace: {
    readonly id: string;
    readonly name: string;
  };
}

function mapDemoWorkflow(workflow: PrismaDemoWorkflowRecord): DemoWorkflowRecord {
  return {
    id: workflow.id,
    publicId: workflow.publicId,
    name: workflow.name,
    triggerType: workflow.triggerType,
    status: 'published',
    version: workflow.version,
  };
}

function mapDemoSessionWorkspace(
  session: PrismaDemoSessionWorkspaceRecord,
): DemoSessionWorkspaceRecord {
  return {
    id: session.workspace.id,
    name: session.workspace.name,
    role: 'owner',
    isDemo: true,
    demoSessionId: session.sessionKeyHash,
    expiresAt: session.expiresAt,
  };
}

function buildSessionWorkflowPublicId(sessionKeyHash: string, index: number): string {
  const indexHex = index.toString(16).padStart(DEMO_SESSION_PUBLIC_ID_INDEX_HEX_LENGTH, '0');
  const prefixLength = DEMO_SESSION_PUBLIC_ID_HEX_LENGTH - DEMO_SESSION_PUBLIC_ID_INDEX_HEX_LENGTH;

  return `wf_${sessionKeyHash.slice(0, prefixLength)}${indexHex.slice(-DEMO_SESSION_PUBLIC_ID_INDEX_HEX_LENGTH)}`;
}

function buildDemoBillingPeriodEnd(start: Date): Date {
  return new Date(start.getTime() + DEMO_BILLING_PERIOD_MS);
}

function mapUsageMetricType(type: DemoUsageQuantityInput['type']): 'EXECUTION' | 'AI_CALL' {
  if (type === 'execution') {
    return 'EXECUTION';
  }

  return 'AI_CALL';
}
