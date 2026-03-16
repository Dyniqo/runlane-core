import { Inject, Injectable } from '@nestjs/common';
import type {
  DeleteWorkflowSecretInput,
  FindWorkflowSecretInput,
  FindWorkflowSecretsByKeysInput,
  StoredWorkflowSecretRecord,
  UpsertWorkflowSecretInput,
  WorkflowSecretRepositoryPort,
} from '@runlane/application';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaWorkflowSecretRepository implements WorkflowSecretRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async upsert(input: UpsertWorkflowSecretInput): Promise<StoredWorkflowSecretRecord> {
    const secret = await this.persistence.client.workflowSecret.upsert({
      where: {
        workspaceId_workflowId_key: {
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          key: input.key,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        key: input.key,
        encryptedValue: input.encryptedValue,
      },
      update: {
        encryptedValue: input.encryptedValue,
      },
      select: workflowSecretSelect,
    });

    return mapWorkflowSecretRecord(secret);
  }

  async listForWorkflow(input: {
    readonly workspaceId: string;
    readonly workflowId: string;
  }): Promise<readonly StoredWorkflowSecretRecord[]> {
    const secrets = await this.persistence.client.workflowSecret.findMany({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
      },
      orderBy: [{ key: 'asc' }, { id: 'asc' }],
      select: workflowSecretSelect,
    });

    return secrets.map((secret) => mapWorkflowSecretRecord(secret));
  }

  async findByKey(input: FindWorkflowSecretInput): Promise<StoredWorkflowSecretRecord | null> {
    const secret = await this.persistence.client.workflowSecret.findFirst({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        key: input.key,
      },
      select: workflowSecretSelect,
    });

    return secret ? mapWorkflowSecretRecord(secret) : null;
  }

  async findManyByKeys(
    input: FindWorkflowSecretsByKeysInput,
  ): Promise<readonly StoredWorkflowSecretRecord[]> {
    if (input.keys.length === 0) {
      return [];
    }

    const secrets = await this.persistence.client.workflowSecret.findMany({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        key: { in: [...input.keys] },
      },
      select: workflowSecretSelect,
    });

    return secrets.map((secret) => mapWorkflowSecretRecord(secret));
  }

  async deleteByKey(input: DeleteWorkflowSecretInput): Promise<StoredWorkflowSecretRecord | null> {
    const existing = await this.findByKey(input);

    if (!existing) {
      return null;
    }

    await this.persistence.client.workflowSecret.delete({
      where: {
        workspaceId_workflowId_key: {
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          key: input.key,
        },
      },
      select: { id: true },
    });

    return existing;
  }
}

const workflowSecretSelect = {
  id: true,
  workspaceId: true,
  workflowId: true,
  key: true,
  encryptedValue: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PrismaWorkflowSecretRecord = {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly key: string;
  readonly encryptedValue: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

function mapWorkflowSecretRecord(secret: PrismaWorkflowSecretRecord): StoredWorkflowSecretRecord {
  return {
    id: secret.id,
    workspaceId: secret.workspaceId,
    workflowId: secret.workflowId,
    key: secret.key,
    encryptedValue: secret.encryptedValue,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}
