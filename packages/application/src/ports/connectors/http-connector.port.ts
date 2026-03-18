import type {
  ConnectorExecutionContext,
  ConnectorExecutionResult,
  JsonObject,
} from '@runlane/contracts';

export const HTTP_CONNECTOR = Symbol('HTTP_CONNECTOR');

export interface HttpConnectorExecutionInput {
  readonly context: ConnectorExecutionContext;
  readonly config: JsonObject;
  readonly secrets: ReadonlyMap<string, string>;
}

export interface HttpConnectorPort {
  execute(input: HttpConnectorExecutionInput): Promise<ConnectorExecutionResult>;
}
