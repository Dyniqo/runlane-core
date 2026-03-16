import type {
  ConnectorCredentialDto,
  ConnectorCredentialResponseDto,
  ListConnectorCredentialsResponseDto,
  ListWorkflowSecretsResponseDto,
  WorkflowSecretDto,
  WorkflowSecretResponseDto,
} from '@runlane/contracts';
import { maskSecretValue } from '@runlane/domain';
import type { StoredConnectorCredentialRecord, StoredWorkflowSecretRecord } from '../../ports';

export function buildWorkflowSecretResponse(
  secret: StoredWorkflowSecretRecord,
): WorkflowSecretResponseDto {
  return { secret: mapWorkflowSecret(secret) };
}

export function buildListWorkflowSecretsResponse(
  secrets: readonly StoredWorkflowSecretRecord[],
): ListWorkflowSecretsResponseDto {
  return { items: secrets.map((secret) => mapWorkflowSecret(secret)) };
}

export function buildConnectorCredentialResponse(
  credential: StoredConnectorCredentialRecord,
): ConnectorCredentialResponseDto {
  return { credential: mapConnectorCredential(credential) };
}

export function buildListConnectorCredentialsResponse(
  credentials: readonly StoredConnectorCredentialRecord[],
): ListConnectorCredentialsResponseDto {
  return { items: credentials.map((credential) => mapConnectorCredential(credential)) };
}

function mapWorkflowSecret(secret: StoredWorkflowSecretRecord): WorkflowSecretDto {
  return {
    id: secret.id,
    workspaceId: secret.workspaceId,
    workflowId: secret.workflowId,
    key: secret.key,
    maskedValue: maskSecretValue(),
    createdAt: secret.createdAt.toISOString(),
    updatedAt: secret.updatedAt.toISOString(),
  };
}

function mapConnectorCredential(
  credential: StoredConnectorCredentialRecord,
): ConnectorCredentialDto {
  return {
    id: credential.id,
    workspaceId: credential.workspaceId,
    workflowId: credential.workflowId,
    name: credential.name,
    type: credential.type,
    maskedValue: maskSecretValue(),
    metadata: credential.metadata,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  };
}
