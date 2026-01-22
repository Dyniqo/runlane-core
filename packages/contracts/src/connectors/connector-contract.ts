import type { JsonObject, JsonValue, MessageTrace } from '../shared';
import type { WorkspaceScope } from '../workspace';

export const CONNECTOR_KINDS = ['http', 'ai_decision', 'slack', 'discord'] as const;
export const CONNECTOR_AUTHENTICATION_MODES = [
  'none',
  'api_key',
  'bearer',
  'basic',
  'custom_header',
] as const;
export const CONNECTOR_FAILURE_CATEGORIES = [
  'configuration',
  'validation',
  'authentication',
  'authorization',
  'rate_limit',
  'timeout',
  'network',
  'remote',
  'unknown',
] as const;
export const CONNECTOR_USAGE_TYPES = ['http_call', 'ai_call', 'notification'] as const;

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];
export type ConnectorAuthenticationMode = (typeof CONNECTOR_AUTHENTICATION_MODES)[number];
export type ConnectorFailureCategory = (typeof CONNECTOR_FAILURE_CATEGORIES)[number];
export type ConnectorUsageType = (typeof CONNECTOR_USAGE_TYPES)[number];

export interface ConnectorReference {
  readonly kind: ConnectorKind;
  readonly credentialReference?: string;
}

export interface ConnectorExecutionContext extends MessageTrace, WorkspaceScope {
  readonly workflowId: string;
  readonly executionId: string;
  readonly stepKey: string;
  readonly attempt: number;
}

export interface ConnectorUsage {
  readonly type: ConnectorUsageType;
  readonly quantity: number;
}

export interface ConnectorExecutionSuccess {
  readonly status: 'succeeded';
  readonly output: JsonValue;
  readonly usage: readonly ConnectorUsage[];
}

export interface ConnectorExecutionError {
  readonly code: string;
  readonly category: ConnectorFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: JsonObject;
}

export interface ConnectorExecutionFailure {
  readonly status: 'failed';
  readonly error: ConnectorExecutionError;
  readonly usage: readonly ConnectorUsage[];
}

export type ConnectorExecutionResult = ConnectorExecutionFailure | ConnectorExecutionSuccess;
