import { DomainError } from '../shared';

export const HTTP_CONNECTOR_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
export const HTTP_CONNECTOR_AUTH_MODES = [
  'none',
  'api_key',
  'bearer',
  'basic',
  'custom_header',
] as const;
export const HTTP_CONNECTOR_API_KEY_LOCATIONS = ['header', 'query'] as const;
export const HTTP_CONNECTOR_BODY_TYPES = ['json', 'text', 'none'] as const;

export type HttpConnectorMethod = (typeof HTTP_CONNECTOR_METHODS)[number];
export type HttpConnectorAuthMode = (typeof HTTP_CONNECTOR_AUTH_MODES)[number];
export type HttpConnectorApiKeyLocation = (typeof HTTP_CONNECTOR_API_KEY_LOCATIONS)[number];
export type HttpConnectorBodyType = (typeof HTTP_CONNECTOR_BODY_TYPES)[number];
export type HttpConnectorJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly HttpConnectorJsonValue[]
  | HttpConnectorJsonObject;
export interface HttpConnectorJsonObject {
  readonly [key: string]: HttpConnectorJsonValue;
}

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
  readonly query?: HttpConnectorJsonObject;
  readonly headers?: HttpConnectorJsonObject;
  readonly body?: HttpConnectorJsonValue;
  readonly bodyType: HttpConnectorBodyType;
}

export interface HttpConnectorResponseConfig {
  readonly successStatusCodes: readonly number[];
  readonly retryStatusCodes: readonly number[];
  readonly bodyPath?: string;
  readonly includeHeaders: boolean;
  readonly maxBodyBytes?: number;
}

export interface HttpConnectorStepConfig {
  readonly request: HttpConnectorRequestConfig;
  readonly auth: HttpConnectorAuthConfig;
  readonly response: HttpConnectorResponseConfig;
}

const HTTP_CONNECTOR_METHOD_SET = new Set<string>(HTTP_CONNECTOR_METHODS);
const HTTP_CONNECTOR_AUTH_MODE_SET = new Set<string>(HTTP_CONNECTOR_AUTH_MODES);
const HTTP_CONNECTOR_API_KEY_LOCATION_SET = new Set<string>(HTTP_CONNECTOR_API_KEY_LOCATIONS);
const HTTP_CONNECTOR_BODY_TYPE_SET = new Set<string>(HTTP_CONNECTOR_BODY_TYPES);
const DEFAULT_SUCCESS_STATUS_CODES = [200, 201, 202, 204] as const;
const DEFAULT_RETRY_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504] as const;
const HTTP_URL_MAX_LENGTH = 2048;
const HTTP_HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}$/;
const HTTP_SAFE_NAME_PATTERN = /^[a-z][a-z0-9_.:-]{1,119}$/;
const HTTP_BODY_PATH_PATTERN = /^[A-Za-z0-9_:-]+(?:\.[A-Za-z0-9_:-]+){0,24}$/;
const HTTP_HEADER_VALUE_MAX_LENGTH = 8192;
const HTTP_QUERY_VALUE_MAX_LENGTH = 2048;
const HTTP_STATUS_CODE_MIN = 100;
const HTTP_STATUS_CODE_MAX = 599;
const HTTP_RESPONSE_BODY_MIN_BYTES = 256;
const HTTP_RESPONSE_BODY_MAX_BYTES = 1048576;
const UNSAFE_REQUEST_HEADER_NAMES = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function readHttpConnectorStepConfig(input: unknown): HttpConnectorStepConfig {
  if (!isPlainObject(input)) {
    throw httpConnectorConfigInvalid('HTTP connector config must be a JSON object');
  }

  const request = readRequestConfig(input.request);
  const auth = readAuthConfig(input.auth);
  const response = readResponseConfig(input.response);

  return {
    request,
    auth,
    response,
  };
}

export function httpConnectorUrlBlocked(message: string): DomainError {
  return new DomainError({
    code: 'HTTP_CONNECTOR_URL_BLOCKED',
    category: 'validation',
    message,
  });
}

export function httpConnectorConfigInvalid(message: string): DomainError {
  return new DomainError({
    code: 'HTTP_CONNECTOR_CONFIG_INVALID',
    category: 'validation',
    message,
  });
}

export function httpConnectorAuthenticationInvalid(message: string): DomainError {
  return new DomainError({
    code: 'HTTP_CONNECTOR_AUTHENTICATION_INVALID',
    category: 'authentication',
    message,
  });
}

function readRequestConfig(value: unknown): HttpConnectorRequestConfig {
  if (!isPlainObject(value)) {
    throw httpConnectorConfigInvalid('HTTP connector request config must be a JSON object');
  }

  const method = readMethod(value.method);
  const url = readUrl(value.url);
  const query = readOptionalStringMap(value.query, 'query', HTTP_QUERY_VALUE_MAX_LENGTH);
  const headers = readOptionalStringMap(value.headers, 'headers', HTTP_HEADER_VALUE_MAX_LENGTH);
  const bodyType = readBodyType(value.bodyType, value.body);
  const body = readOptionalJsonValue(value.body, 'body');

  for (const headerName of Object.keys(headers ?? {})) {
    const normalizedHeaderName = headerName.toLowerCase();

    if (
      !HTTP_HEADER_NAME_PATTERN.test(headerName) ||
      UNSAFE_REQUEST_HEADER_NAMES.has(normalizedHeaderName)
    ) {
      throw httpConnectorConfigInvalid(
        `HTTP connector request header '${headerName}' is not allowed`,
      );
    }
  }

  return {
    method,
    url,
    ...(query ? { query } : {}),
    ...(headers ? { headers } : {}),
    ...(body !== undefined ? { body } : {}),
    bodyType,
  };
}

function readAuthConfig(value: unknown): HttpConnectorAuthConfig {
  if (value === undefined || value === null) {
    return { mode: 'none' };
  }

  if (!isPlainObject(value)) {
    throw httpConnectorConfigInvalid('HTTP connector auth config must be a JSON object');
  }

  const mode = readAuthMode(value.mode);

  if (mode === 'none') {
    return { mode };
  }

  const credentialName = readSafeName(
    value.credentialName,
    'HTTP connector credentialName is invalid',
  );

  if (mode === 'bearer' || mode === 'basic') {
    return { mode, credentialName };
  }

  const name = readHeaderOrQueryName(value.name, mode);

  if (mode === 'api_key') {
    return {
      mode,
      credentialName,
      location: readApiKeyLocation(value.location),
      name,
    };
  }

  return {
    mode,
    credentialName,
    name,
  };
}

function readResponseConfig(value: unknown): HttpConnectorResponseConfig {
  if (value === undefined || value === null) {
    return {
      successStatusCodes: [...DEFAULT_SUCCESS_STATUS_CODES],
      retryStatusCodes: [...DEFAULT_RETRY_STATUS_CODES],
      includeHeaders: false,
    };
  }

  if (!isPlainObject(value)) {
    throw httpConnectorConfigInvalid('HTTP connector response config must be a JSON object');
  }

  const successStatusCodes = readStatusCodeList(
    value.successStatusCodes,
    DEFAULT_SUCCESS_STATUS_CODES,
    'HTTP connector successStatusCodes are invalid',
  );
  const retryStatusCodes = readStatusCodeList(
    value.retryStatusCodes,
    DEFAULT_RETRY_STATUS_CODES,
    'HTTP connector retryStatusCodes are invalid',
  );
  const bodyPath = readOptionalBodyPath(value.bodyPath);
  const includeHeaders = readOptionalBoolean(value.includeHeaders, false, 'includeHeaders');
  const maxBodyBytes = readOptionalInteger(
    value.maxBodyBytes,
    HTTP_RESPONSE_BODY_MIN_BYTES,
    HTTP_RESPONSE_BODY_MAX_BYTES,
    'HTTP connector response maxBodyBytes is invalid',
  );

  return {
    successStatusCodes,
    retryStatusCodes,
    ...(bodyPath ? { bodyPath } : {}),
    includeHeaders,
    ...(maxBodyBytes !== undefined ? { maxBodyBytes } : {}),
  };
}

function readMethod(value: unknown): HttpConnectorMethod {
  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid('HTTP connector request method is required');
  }

  const method = value.trim().toUpperCase();

  if (!HTTP_CONNECTOR_METHOD_SET.has(method)) {
    throw httpConnectorConfigInvalid('HTTP connector request method is invalid');
  }

  return method as HttpConnectorMethod;
}

function readUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid('HTTP connector request URL is required');
  }

  const url = value.trim();

  if (url.length === 0 || url.length > HTTP_URL_MAX_LENGTH) {
    throw httpConnectorConfigInvalid('HTTP connector request URL is invalid');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw httpConnectorConfigInvalid('HTTP connector request URL is invalid');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw httpConnectorConfigInvalid('HTTP connector request URL must use HTTP or HTTPS');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw httpConnectorConfigInvalid('HTTP connector request URL must not include credentials');
  }

  if (!parsedUrl.hostname) {
    throw httpConnectorConfigInvalid('HTTP connector request URL must include a hostname');
  }

  return parsedUrl.toString();
}

function readBodyType(value: unknown, body: unknown): HttpConnectorBodyType {
  if (value === undefined || value === null) {
    return body === undefined ? 'none' : typeof body === 'string' ? 'text' : 'json';
  }

  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid('HTTP connector request bodyType is invalid');
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!HTTP_CONNECTOR_BODY_TYPE_SET.has(normalizedValue)) {
    throw httpConnectorConfigInvalid('HTTP connector request bodyType is invalid');
  }

  return normalizedValue as HttpConnectorBodyType;
}

function readAuthMode(value: unknown): HttpConnectorAuthMode {
  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid('HTTP connector auth mode is required');
  }

  const mode = value.trim().toLowerCase();

  if (!HTTP_CONNECTOR_AUTH_MODE_SET.has(mode)) {
    throw httpConnectorConfigInvalid('HTTP connector auth mode is invalid');
  }

  return mode as HttpConnectorAuthMode;
}

function readApiKeyLocation(value: unknown): HttpConnectorApiKeyLocation {
  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid('HTTP connector API key location is required');
  }

  const location = value.trim().toLowerCase();

  if (!HTTP_CONNECTOR_API_KEY_LOCATION_SET.has(location)) {
    throw httpConnectorConfigInvalid('HTTP connector API key location is invalid');
  }

  return location as HttpConnectorApiKeyLocation;
}

function readSafeName(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid(message);
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!HTTP_SAFE_NAME_PATTERN.test(normalizedValue)) {
    throw httpConnectorConfigInvalid(message);
  }

  return normalizedValue;
}

function readHeaderOrQueryName(value: unknown, mode: HttpConnectorAuthMode): string {
  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid('HTTP connector auth name is required');
  }

  const normalizedValue = value.trim();

  if (mode === 'custom_header' && !HTTP_HEADER_NAME_PATTERN.test(normalizedValue)) {
    throw httpConnectorConfigInvalid('HTTP connector custom header name is invalid');
  }

  if (mode === 'custom_header' && UNSAFE_REQUEST_HEADER_NAMES.has(normalizedValue.toLowerCase())) {
    throw httpConnectorConfigInvalid('HTTP connector custom header name is not allowed');
  }

  if (mode === 'api_key' && (normalizedValue.length === 0 || normalizedValue.length > 120)) {
    throw httpConnectorConfigInvalid('HTTP connector API key name is invalid');
  }

  return normalizedValue;
}

function readOptionalStringMap(
  value: unknown,
  fieldName: string,
  maxValueLength: number,
): HttpConnectorJsonObject | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw httpConnectorConfigInvalid(`HTTP connector ${fieldName} must be a JSON object`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      assertSafeObjectKey(key, `HTTP connector ${fieldName} contains an unsafe key`);

      if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
        throw httpConnectorConfigInvalid(
          `HTTP connector ${fieldName} values must be scalar values`,
        );
      }

      const itemValue = String(item);

      if (itemValue.length > maxValueLength) {
        throw httpConnectorConfigInvalid(`HTTP connector ${fieldName} value is too long`);
      }

      return [key, itemValue];
    }),
  );
}

function readOptionalJsonValue(
  value: unknown,
  fieldName: string,
): HttpConnectorJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isJsonValue(value)) {
    throw httpConnectorConfigInvalid(`HTTP connector ${fieldName} must be a JSON value`);
  }

  return value;
}

function readStatusCodeList(
  value: unknown,
  defaultValue: readonly number[],
  message: string,
): readonly number[] {
  if (value === undefined || value === null) {
    return [...defaultValue];
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw httpConnectorConfigInvalid(message);
  }

  const values = value.map((item) => {
    if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      item < HTTP_STATUS_CODE_MIN ||
      item > HTTP_STATUS_CODE_MAX
    ) {
      throw httpConnectorConfigInvalid(message);
    }

    return item;
  });

  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function readOptionalBodyPath(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw httpConnectorConfigInvalid('HTTP connector response bodyPath is invalid');
  }

  const normalizedValue = value.trim();

  if (!HTTP_BODY_PATH_PATTERN.test(normalizedValue)) {
    throw httpConnectorConfigInvalid('HTTP connector response bodyPath is invalid');
  }

  return normalizedValue;
}

function readOptionalBoolean(value: unknown, defaultValue: boolean, fieldName: string): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== 'boolean') {
    throw httpConnectorConfigInvalid(`HTTP connector response ${fieldName} is invalid`);
  }

  return value;
}

function readOptionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  message: string,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw httpConnectorConfigInvalid(message);
  }

  return value;
}

function isJsonValue(value: unknown): value is HttpConnectorJsonValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;

  if (valueType === 'string' || valueType === 'boolean') {
    return true;
  }

  if (valueType === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).every(([key, item]) => {
      assertSafeObjectKey(key, 'HTTP connector JSON object contains an unsafe key');
      return isJsonValue(item);
    });
  }

  return false;
}

function assertSafeObjectKey(key: string, message: string): void {
  if (UNSAFE_OBJECT_KEYS.has(key)) {
    throw httpConnectorConfigInvalid(message);
  }
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
