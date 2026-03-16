import type { JsonObject } from '@runlane/contracts';
import type { ConnectorCredentialType } from '@runlane/domain';

export const CONNECTOR_CREDENTIAL_REPOSITORY = Symbol('CONNECTOR_CREDENTIAL_REPOSITORY');

export interface StoredConnectorCredentialRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly name: string;
  readonly type: ConnectorCredentialType;
  readonly encryptedValue: string;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpsertConnectorCredentialInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly name: string;
  readonly type: ConnectorCredentialType;
  readonly encryptedValue: string;
  readonly metadata: JsonObject;
}

export interface FindConnectorCredentialInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly name: string;
}

export interface DeleteConnectorCredentialInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly name: string;
}

export interface ConnectorCredentialRepositoryPort {
  upsert(input: UpsertConnectorCredentialInput): Promise<StoredConnectorCredentialRecord>;
  listForWorkflow(input: {
    readonly workspaceId: string;
    readonly workflowId: string;
  }): Promise<readonly StoredConnectorCredentialRecord[]>;
  findByName(input: FindConnectorCredentialInput): Promise<StoredConnectorCredentialRecord | null>;
  deleteByName(
    input: DeleteConnectorCredentialInput,
  ): Promise<StoredConnectorCredentialRecord | null>;
}
