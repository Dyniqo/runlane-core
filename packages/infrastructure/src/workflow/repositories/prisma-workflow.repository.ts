import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateWorkflowInput,
  StoredWorkflowRecord,
  UpdateWorkflowInput,
  WorkflowRepositoryPort,
} from '@runlane/application';
import type { JsonValue } from '@runlane/contracts';
import type { WorkflowStatus } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaWorkflowRepository implements WorkflowRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async createForWorkspace(input: CreateWorkflowInput): Promise<StoredWorkflowRecord> {
    const workflow = await this.persistence.client.workflow.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        triggerType: input.triggerType,
        definitionJson: input.definition as Prisma.InputJsonValue,
      },
      select: workflowSelect,
    });

    return mapWorkflowRecord(workflow);
  }

  async listForWorkspace(workspaceId: string): Promise<readonly StoredWorkflowRecord[]> {
    const workflows = await this.persistence.client.workflow.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: workflowSelect,
    });

    return workflows.map((workflow) => mapWorkflowRecord(workflow));
  }

  async findByWorkspaceId(input: {
    readonly workspaceId: string;
    readonly id: string;
  }): Promise<StoredWorkflowRecord | null> {
    const workflow = await this.persistence.client.workflow.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
      select: workflowSelect,
    });

    return workflow ? mapWorkflowRecord(workflow) : null;
  }

  async updateForWorkspace(input: UpdateWorkflowInput): Promise<StoredWorkflowRecord | null> {
    const updated = await this.persistence.client.workflow.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.triggerType !== undefined ? { triggerType: input.triggerType } : {}),
        ...(input.definition !== undefined
          ? { definitionJson: input.definition as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByWorkspaceId({ id: input.id, workspaceId: input.workspaceId });
  }
}

const workflowSelect = {
  id: true,
  workspaceId: true,
  name: true,
  status: true,
  version: true,
  triggerType: true,
  definitionJson: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PrismaWorkflowRecord = {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly status: string;
  readonly version: number;
  readonly triggerType: string;
  readonly definitionJson: Prisma.JsonValue;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

function mapWorkflowRecord(workflow: PrismaWorkflowRecord): StoredWorkflowRecord {
  return {
    id: workflow.id,
    workspaceId: workflow.workspaceId,
    name: workflow.name,
    status: mapWorkflowStatus(workflow.status),
    version: workflow.version,
    triggerType: workflow.triggerType,
    definition: workflow.definitionJson as JsonValue,
    publishedAt: workflow.publishedAt,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}

function mapWorkflowStatus(status: string): WorkflowStatus {
  if (status === 'DRAFT') {
    return 'draft';
  }

  if (status === 'PUBLISHED') {
    return 'published';
  }

  if (status === 'ARCHIVED') {
    return 'archived';
  }

  throw new TypeError(`Unsupported workflow status '${status}'`);
}
