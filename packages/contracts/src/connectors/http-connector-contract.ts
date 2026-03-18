import type { JsonObject, JsonValue } from '../shared';

export const HTTP_CONNECTOR_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
export const HTTP_CONNECTOR_API_KEY_LOCATIONS = ['header', 'query'] as const;
export const HTTP_CONNECTOR_BODY_TYPES = ['json', 'text', 'none'] as const;

export type HttpConnectorMethod = (typeof HTTP_CONNECTOR_METHODS)[number];
export type HttpConnectorApiKeyLocation = (typeof HTTP_CONNECTOR_API_KEY_LOCATIONS)[number];
export type HttpConnectorBodyType = (typeof HTTP_CONNECTOR_BODY_TYPES)[number];

export interface HttpConnectorAuthNoneConfig {
  readonly mode: 'none';
}

export interface HttpConnectorAuthBearerConfig {
  readonly mode: 'bearer';
  readonly credentialName: string;
}

export interface HttpConnectorAuthBasicConfig {
  readonly mode: 'basic';
  readonly credentialName: string;
}

export interface HttpConnectorAuthApiKeyConfig {
  readonly mode: 'api_key';
  readonly credentialName: string;
  readonly location: HttpConnectorApiKeyLocation;
  readonly name: string;
}

export interface HttpConnectorAuthCustomHeaderConfig {
  readonly mode: 'custom_header';
  readonly credentialName: string;
  readonly name: string;
}

export type HttpConnectorAuthConfig =
  | HttpConnectorAuthApiKeyConfig
  | HttpConnectorAuthBasicConfig
  | HttpConnectorAuthBearerConfig
  | HttpConnectorAuthCustomHeaderConfig
  | HttpConnectorAuthNoneConfig;

export interface HttpConnectorRequestConfig {
  readonly method: HttpConnectorMethod;
  readonly url: string;
  readonly query?: JsonObject;
  readonly headers?: JsonObject;
  readonly body?: JsonValue;
  readonly bodyType?: HttpConnectorBodyType;
}

export interface HttpConnectorResponseConfig {
  readonly successStatusCodes?: readonly number[];
  readonly retryStatusCodes?: readonly number[];
  readonly bodyPath?: string;
  readonly includeHeaders?: boolean;
  readonly maxBodyBytes?: number;
}

export interface HttpConnectorStepConfig {
  readonly request: HttpConnectorRequestConfig;
  readonly auth?: HttpConnectorAuthConfig;
  readonly response?: HttpConnectorResponseConfig;
}
