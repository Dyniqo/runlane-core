import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  DemoRepositoryPort,
  DemoSeedRecord,
  DemoWorkflowRecord,
  DemoUsageQuantityInput,
  DemoWorkspaceStateRecord,
  ResetDemoWorkspaceInput,
  SeedDemoWorkspaceInput,
} from '@runlane/application';
import { PrismaPersistenceContext } from '../../prisma';

const DEMO_API_KEY_NAME = 'Demo automation key';
const DEMO_AUDIT_ENTITY_TYPE = 'demo';

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
      },
    });

    if (!workspace) {
      throw new TypeError('Demo workspace reset requires an existing demo workspace');
    }

    await this.deleteDemoMutableState(input.workspaceId);

    const record = await this.seed({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      workspaceName: input.workspaceName,
      apiKey: input.apiKey,
      seedVersion: input.seedVersion,
      workflows: input.workflows,
      seededAt: input.resetAt,
    });

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
        } as Prisma.InputJsonValue,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    return record;
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
            plan: 'FREE',
            billingStatus: 'NONE',
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            billingCurrentPeriodStart: null,
            billingCurrentPeriodEnd: null,
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
            plan: 'FREE',
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
        select: {
          id: true,
          publicId: true,
          name: true,
          triggerType: true,
          status: true,
          version: true,
        },
      });

      workflows.push({
        id: record.id,
        publicId: record.publicId,
        name: record.name,
        triggerType: record.triggerType,
        status: 'published' as const,
        version: record.version,
      });
    }

    return workflows;
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

function mapUsageMetricType(type: DemoUsageQuantityInput['type']): 'EXECUTION' | 'AI_CALL' {
  if (type === 'execution') {
    return 'EXECUTION';
  }

  return 'AI_CALL';
}
