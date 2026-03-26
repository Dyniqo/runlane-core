import type {
  ExecutionFailureNotificationInput,
  NotificationConnectorResult,
  NotificationExecutionInput,
} from '@runlane/contracts';
import type { ConnectorExecutionResult } from '@runlane/contracts';

export const NOTIFICATION_CONNECTOR = Symbol('NOTIFICATION_CONNECTOR');

export interface NotificationConnectorPort {
  execute(input: NotificationExecutionInput): Promise<ConnectorExecutionResult>;
  sendExecutionFailureAlert(
    input: ExecutionFailureNotificationInput,
  ): Promise<readonly NotificationConnectorResult[]>;
}
