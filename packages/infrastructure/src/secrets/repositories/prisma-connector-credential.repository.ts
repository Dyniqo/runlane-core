import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ConnectorCredentialRepositoryPort,
  DeleteConnectorCredentialInput,
  FindConnectorCredentialInput,
  StoredConnectorCredentialRecord,
  UpsertConnectorCredentialInput,
} from '@runlane/application';
import type { JsonObject } from '@runlane/contracts';
import type { ConnectorCredentialType } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaConnectorCredentialRepository implements ConnectorCredentialRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async upsert(input: UpsertConnectorCredentialInput): Promise<StoredConnectorCredentialRecord> {
    const credential = await this.persistence.client.connectorCredential.upsert({
      where: {
        workspaceId_workflowId_name: {
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          name: input.name,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        name: input.name,
        type: input.type,
        encryptedValue: input.encryptedValue,
        metadataJson: input.metadata as Prisma.InputJsonValue,
      },
      update: {
        type: input.type,
        encryptedValue: input.encryptedValue,
        metadataJson: input.metadata as Prisma.InputJsonValue,
      },
      select: connectorCredentialSelect,
    });

    return mapConnectorCredentialRecord(credential);
  }

  async listForWorkflow(input: {
    readonly workspaceId: string;
    readonly workflowId: string;
  }): Promise<readonly StoredConnectorCredentialRecord[]> {
    const credentials = await this.persistence.client.connectorCredential.findMany({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: connectorCredentialSelect,
    });

    return credentials.map((credential) => mapConnectorCredentialRecord(credential));
  }

  async findByName(
    input: FindConnectorCredentialInput,
  ): Promise<StoredConnectorCredentialRecord | null> {
    const credential = await this.persistence.client.connectorCredential.findFirst({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        name: input.name,
      },
      select: connectorCredentialSelect,
    });

    return credential ? mapConnectorCredentialRecord(credential) : null;
  }

  async deleteByName(
    input: DeleteConnectorCredentialInput,
  ): Promise<StoredConnectorCredentialRecord | null> {
    const existing = await this.findByName(input);

    if (!existing) {
      return null;
    }

    await this.persistence.client.connectorCredential.delete({
      where: {
        workspaceId_workflowId_name: {
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          name: input.name,
        },
      },
      select: { id: true },
    });

    return existing;
  }
}

const connectorCredentialSelect = {
  id: true,
  workspaceId: true,
  workflowId: true,
  name: true,
  type: true,
  encryptedValue: true,
  metadataJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PrismaConnectorCredentialRecord = {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly name: string;
  readonly type: string;
  readonly encryptedValue: string;
  readonly metadataJson: Prisma.JsonValue;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

function mapConnectorCredentialRecord(
  credential: PrismaConnectorCredentialRecord,
): StoredConnectorCredentialRecord {
  return {
    id: credential.id,
    workspaceId: credential.workspaceId,
    workflowId: credential.workflowId,
    name: credential.name,
    type: mapConnectorCredentialType(credential.type),
    encryptedValue: credential.encryptedValue,
    metadata: credential.metadataJson as JsonObject,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

function mapConnectorCredentialType(type: string): ConnectorCredentialType {
  if (
    type === 'api_key' ||
    type === 'bearer_token' ||
    type === 'basic_auth' ||
    type === 'custom_header' ||
    type === 'webhook_url' ||
    type === 'generic'
  ) {
    return type;
  }

  throw new TypeError(`Unsupported connector credential type '${type}'`);
}
