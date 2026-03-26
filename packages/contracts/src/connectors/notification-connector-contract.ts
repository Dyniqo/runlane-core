import type { ConnectorExecutionContext, ConnectorExecutionResult } from './connector-contract';
import type { JsonObject } from '../shared';

export const NOTIFICATION_PROVIDERS = ['slack', 'discord'] as const;
export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'error'] as const;

export type NotificationProvider = (typeof NOTIFICATION_PROVIDERS)[number];
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export interface NotificationExecutionContext extends ConnectorExecutionContext {
  readonly workflowName?: string;
  readonly executionStatus?: string;
}

export interface NotificationStepConfig {
  readonly provider: NotificationProvider;
  readonly credentialName?: string;
  readonly title?: string;
  readonly message: string;
  readonly severity?: NotificationSeverity;
  readonly metadata?: JsonObject;
  readonly includeExecutionContext?: boolean;
}

export interface NotificationExecutionInput {
  readonly context: NotificationExecutionContext;
  readonly config: JsonObject;
}

export interface ExecutionFailureNotificationInput {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly executionId: string;
  readonly jobId: string;
  readonly correlationId: string;
  readonly status: 'failed' | 'dead_letter';
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly durationMs: number;
}

export interface NotificationConnectorResult {
  readonly provider: NotificationProvider;
  readonly result: ConnectorExecutionResult;
}
