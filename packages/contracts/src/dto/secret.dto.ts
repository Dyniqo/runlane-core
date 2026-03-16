import type { JsonObject } from '../shared';

export type ConnectorCredentialTypeDto =
  | 'api_key'
  | 'bearer_token'
  | 'basic_auth'
  | 'custom_header'
  | 'webhook_url'
  | 'generic';

export interface WorkflowSecretDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly key: string;
  readonly maskedValue: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpsertWorkflowSecretRequestDto {
  readonly key: string;
  readonly value: string;
}

export interface WorkflowSecretResponseDto {
  readonly secret: WorkflowSecretDto;
}

export interface ListWorkflowSecretsResponseDto {
  readonly items: readonly WorkflowSecretDto[];
}

export interface DeleteWorkflowSecretResponseDto {
  readonly deleted: true;
}

export interface ConnectorCredentialDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly name: string;
  readonly type: ConnectorCredentialTypeDto;
  readonly maskedValue: string;
  readonly metadata: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpsertConnectorCredentialRequestDto {
  readonly name: string;
  readonly type: ConnectorCredentialTypeDto;
  readonly value: string;
  readonly metadata?: JsonObject;
}

export interface ConnectorCredentialResponseDto {
  readonly credential: ConnectorCredentialDto;
}

export interface ListConnectorCredentialsResponseDto {
  readonly items: readonly ConnectorCredentialDto[];
}

export interface DeleteConnectorCredentialResponseDto {
  readonly deleted: true;
}
