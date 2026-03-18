import { lookup as nodeLookup } from 'node:dns';
import type { LookupAllOptions, LookupOneOptions } from 'node:dns';
import { lookup as lookupAsync } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as netConnect, isIP } from 'node:net';
import type { Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { URL } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import {
  buildConnectorCredentialAssociatedData,
  CONNECTOR_CREDENTIAL_REPOSITORY,
  SECRET_CIPHER,
} from '@runlane/application';
import type {
  ConnectorCredentialRepositoryPort,
  HttpConnectorExecutionInput,
  HttpConnectorPort,
  SecretCipherPort,
} from '@runlane/application';
import { RuntimeConfigService } from '@runlane/config';
import type {
  ConnectorExecutionError,
  ConnectorExecutionResult,
  JsonObject,
  JsonValue,
} from '@runlane/contracts';
import {
  httpConnectorAuthenticationInvalid,
  httpConnectorUrlBlocked,
  readHttpConnectorStepConfig,
} from '@runlane/domain';
import type {
  HttpConnectorAuthConfig,
  HttpConnectorRequestConfig,
  HttpConnectorResponseConfig,
  HttpConnectorStepConfig,
} from '@runlane/domain';

interface HttpConnectorRuntimeOptions {
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly redirectLimit: number;
  readonly allowlist: readonly string[];
}

interface RequestExecutionResult {
  readonly finalUrl: URL;
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
  readonly redirected: boolean;
  readonly redirectCount: number;
}

interface PreparedRequest {
  readonly url: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer | undefined;
}

interface ResolvedCredential {
  readonly value: string;
}

interface ProxyConfig {
  readonly url: URL;
  readonly authorizationHeader: string | undefined;
}

const SECRET_REFERENCE_OBJECT_KEY = '__runlaneSecretRef';
const DEFAULT_USER_AGENT = 'Runlane-HttpConnector/1.0';
const REQUEST_BODY_MAX_BYTES = 262144;
const RESPONSE_HEADER_VALUE_MAX_LENGTH = 4096;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

@Injectable()
export class SecureHttpConnector implements HttpConnectorPort {
  private readonly options: HttpConnectorRuntimeOptions;

  constructor(
    @Inject(RuntimeConfigService) config: RuntimeConfigService,
    @Inject(CONNECTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ConnectorCredentialRepositoryPort,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipherPort,
  ) {
    this.options = {
      timeoutMs: config.httpConnectorTimeoutMs,
      maxResponseBytes: config.httpConnectorMaxResponseBytes,
      redirectLimit: config.httpConnectorRedirectLimit,
      allowlist: config.httpConnectorDemoUrlAllowlist,
    };
  }

  async execute(input: HttpConnectorExecutionInput): Promise<ConnectorExecutionResult> {
    const startedAt = Date.now();

    try {
      const config = readHttpConnectorStepConfig(input.config);
      const preparedRequest = await this.prepareRequest(input, config);
      const response = await this.executeWithRedirects(preparedRequest, config.response);
      const durationMs = Math.max(0, Date.now() - startedAt);
      const parsedBody = parseResponseBody(response.body, response.headers);
      const mappedBody = config.response.bodyPath
        ? readResponseBodyPath(parsedBody, config.response.bodyPath)
        : parsedBody;
      const responseBodyBytes = response.body.byteLength;
      const successStatusCodes = new Set(config.response.successStatusCodes);
      const retryStatusCodes = new Set(config.response.retryStatusCodes);

      if (!successStatusCodes.has(response.statusCode)) {
        return {
          status: 'failed',
          error: {
            code: retryStatusCodes.has(response.statusCode)
              ? 'HTTP_CONNECTOR_RETRYABLE_STATUS'
              : 'HTTP_CONNECTOR_STATUS_NOT_ACCEPTED',
            category: retryStatusCodes.has(response.statusCode) ? 'remote' : 'validation',
            message: `HTTP connector received status ${response.statusCode}`,
            retryable: retryStatusCodes.has(response.statusCode),
            details: {
              statusCode: response.statusCode,
              finalUrl: maskUrlForOutput(response.finalUrl),
              durationMs,
              responseBodyBytes,
            },
          },
          usage: [{ type: 'http_call', quantity: 1 }],
        };
      }

      return {
        status: 'succeeded',
        output: {
          statusCode: response.statusCode,
          ok: true,
          url: maskUrlForOutput(response.finalUrl),
          durationMs,
          responseBodyBytes,
          redirected: response.redirected,
          redirectCount: response.redirectCount,
          body: mappedBody,
          ...(config.response.includeHeaders ? { headers: response.headers } : {}),
        },
        usage: [{ type: 'http_call', quantity: 1 }],
      };
    } catch (error) {
      return {
        status: 'failed',
        error: classifyConnectorError(error),
        usage: [{ type: 'http_call', quantity: 1 }],
      };
    }
  }

  private async prepareRequest(
    input: HttpConnectorExecutionInput,
    config: HttpConnectorStepConfig,
  ): Promise<PreparedRequest> {
    const resolvedUrl = replaceSecrets(config.request.url, input.secrets);

    if (typeof resolvedUrl !== 'string') {
      throw new ConnectorHttpError({
        code: 'HTTP_CONNECTOR_CONFIG_INVALID',
        category: 'validation',
        message: 'HTTP connector request URL must resolve to a string',
        retryable: false,
      });
    }

    const url = new URL(resolvedUrl);
    applyQuery(url, readJsonObject(replaceSecrets(config.request.query ?? {}, input.secrets)));
    await this.assertUrlAllowed(url);

    const headers = new Map<string, string>();
    headers.set('accept', 'application/json, text/plain;q=0.9, */*;q=0.8');
    headers.set('user-agent', DEFAULT_USER_AGENT);

    for (const [name, value] of Object.entries(
      readJsonObject(replaceSecrets(config.request.headers ?? {}, input.secrets)),
    )) {
      headers.set(name.toLowerCase(), String(value));
    }

    await this.applyAuthentication({ input, config, url, headers });
    const body = buildRequestBody(config.request, input.secrets, headers);

    if (body && body.byteLength > REQUEST_BODY_MAX_BYTES) {
      throw new ConnectorHttpError({
        code: 'HTTP_CONNECTOR_REQUEST_TOO_LARGE',
        category: 'validation',
        message: 'HTTP connector request body exceeds the maximum accepted size',
        retryable: false,
      });
    }

    if (body && !headers.has('content-type')) {
      headers.set(
        'content-type',
        config.request.bodyType === 'json' ? 'application/json' : 'text/plain; charset=utf-8',
      );
    }

    return {
      url,
      method: config.request.method,
      headers: Object.fromEntries(headers),
      body,
    };
  }

  private async applyAuthentication(input: {
    readonly input: HttpConnectorExecutionInput;
    readonly config: HttpConnectorStepConfig;
    readonly url: URL;
    readonly headers: Map<string, string>;
  }): Promise<void> {
    const auth = input.config.auth;

    if (auth.mode === 'none') {
      return;
    }

    const credential = await this.resolveCredential(input.input, auth);

    if (auth.mode === 'bearer') {
      input.headers.set('authorization', `Bearer ${credential.value}`);
      return;
    }

    if (auth.mode === 'basic') {
      input.headers.set(
        'authorization',
        `Basic ${Buffer.from(credential.value, 'utf8').toString('base64')}`,
      );
      return;
    }

    if (auth.mode === 'custom_header') {
      input.headers.set(auth.name.toLowerCase(), credential.value);
      return;
    }

    if (auth.location === 'header') {
      input.headers.set(auth.name.toLowerCase(), credential.value);
      return;
    }

    input.url.searchParams.set(auth.name, credential.value);
  }

  private async resolveCredential(
    input: HttpConnectorExecutionInput,
    auth: Exclude<HttpConnectorAuthConfig, { readonly mode: 'none' }>,
  ): Promise<ResolvedCredential> {
    const record = await this.credentials.findByName({
      workspaceId: input.context.workspaceId,
      workflowId: input.context.workflowId,
      name: auth.credentialName,
    });

    if (!record) {
      throw httpConnectorAuthenticationInvalid('HTTP connector credential was not found');
    }

    const value = this.cipher.decrypt({
      ciphertext: record.encryptedValue,
      associatedData: buildConnectorCredentialAssociatedData({
        workspaceId: input.context.workspaceId,
        workflowId: input.context.workflowId,
        name: record.name,
        type: record.type,
      }),
    });

    if (value.trim().length === 0) {
      throw httpConnectorAuthenticationInvalid('HTTP connector credential is empty');
    }

    return { value };
  }

  private async executeWithRedirects(
    request: PreparedRequest,
    responseConfig: HttpConnectorResponseConfig,
  ): Promise<RequestExecutionResult> {
    let currentRequest = request;
    let redirectCount = 0;

    while (true) {
      const response = await this.executeSingleRequest(currentRequest, responseConfig);

      if (!REDIRECT_STATUS_CODES.has(response.statusCode)) {
        return {
          ...response,
          redirected: redirectCount > 0,
          redirectCount,
        };
      }

      const location = response.headers.location;

      if (!location) {
        return {
          ...response,
          redirected: redirectCount > 0,
          redirectCount,
        };
      }

      if (redirectCount >= this.options.redirectLimit) {
        throw new ConnectorHttpError({
          code: 'HTTP_CONNECTOR_REDIRECT_LIMIT_EXCEEDED',
          category: 'validation',
          message: 'HTTP connector redirect limit was exceeded',
          retryable: false,
        });
      }

      const nextUrl = new URL(location, currentRequest.url);
      await this.assertUrlAllowed(nextUrl);
      redirectCount += 1;
      currentRequest = {
        ...currentRequest,
        url: nextUrl,
        method: response.statusCode === 303 ? 'GET' : currentRequest.method,
        body: response.statusCode === 303 ? undefined : currentRequest.body,
      };
    }
  }

  private async executeSingleRequest(
    request: PreparedRequest,
    responseConfig: HttpConnectorResponseConfig,
  ): Promise<Omit<RequestExecutionResult, 'redirectCount' | 'redirected'>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const responseBodyLimit = Math.min(
      responseConfig.maxBodyBytes ?? this.options.maxResponseBytes,
      this.options.maxResponseBytes,
    );

    try {
      await resolveAllowedAddresses(request.url.hostname);
      const proxy = readProxyConfig(request.url);

      if (proxy) {
        return await performNodeRequestThroughProxy({
          request,
          proxy,
          timeoutMs: this.options.timeoutMs,
          signal: controller.signal,
          responseBodyLimit,
        });
      }

      return await performNodeRequestWithSafeLookup({
        request,
        timeoutMs: this.options.timeoutMs,
        signal: controller.signal,
        responseBodyLimit,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async assertUrlAllowed(url: URL): Promise<void> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw httpConnectorUrlBlocked('HTTP connector URL must use HTTP or HTTPS');
    }

    if (url.username || url.password) {
      throw httpConnectorUrlBlocked('HTTP connector URL must not include credentials');
    }

    const normalizedHostname = normalizeHostname(url.hostname);

    if (
      BLOCKED_HOSTNAMES.has(normalizedHostname) ||
      normalizedHostname.endsWith('.localhost') ||
      normalizedHostname === '169.254.169.254'
    ) {
      throw httpConnectorUrlBlocked('HTTP connector URL host is not allowed');
    }

    if (!this.isAllowlisted(url)) {
      throw httpConnectorUrlBlocked('HTTP connector URL is outside the configured allowlist');
    }

    await resolveAllowedAddresses(url.hostname);
  }

  private isAllowlisted(url: URL): boolean {
    if (this.options.allowlist.length === 0) {
      return true;
    }

    return this.options.allowlist.some((entry) => matchesAllowlistEntry(url, entry));
  }
}

class ConnectorHttpError extends Error {
  readonly code: string;
  readonly category: ConnectorExecutionError['category'];
  readonly retryable: boolean;
  readonly details: JsonObject | undefined;

  constructor(input: ConnectorExecutionError) {
    super(input.message);
    this.name = 'ConnectorHttpError';
    this.code = input.code;
    this.category = input.category;
    this.retryable = input.retryable;
    this.details = input.details;
  }
}

function buildRequestBody(
  request: HttpConnectorRequestConfig,
  secrets: ReadonlyMap<string, string>,
  headers: Map<string, string>,
): Buffer | undefined {
  if (request.bodyType === 'none' || request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  const value = replaceSecrets(request.body ?? null, secrets);

  if (request.bodyType === 'text') {
    return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  }

  headers.set('content-type', headers.get('content-type') ?? 'application/json');
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function readJsonObject(value: JsonValue): JsonObject {
  if (!isJsonObject(value) || Array.isArray(value)) {
    throw new ConnectorHttpError({
      code: 'HTTP_CONNECTOR_CONFIG_INVALID',
      category: 'validation',
      message: 'HTTP connector mapped value must be a JSON object',
      retryable: false,
    });
  }

  return value;
}

function applyQuery(url: URL, query: JsonObject): void {
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
}

function replaceSecrets(
  value: JsonValue | undefined,
  secrets: ReadonlyMap<string, string>,
): JsonValue {
  if (value === undefined) {
    return {};
  }

  if (isSecretReference(value)) {
    const key = value[SECRET_REFERENCE_OBJECT_KEY];
    const secretValue = typeof key === 'string' ? secrets.get(key) : undefined;

    if (secretValue === undefined) {
      throw new ConnectorHttpError({
        code: 'HTTP_CONNECTOR_SECRET_UNRESOLVED',
        category: 'validation',
        message: 'HTTP connector secret reference could not be resolved',
        retryable: false,
      });
    }

    return secretValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceSecrets(item, secrets));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceSecrets(item, secrets)]),
    );
  }

  return value;
}

function isSecretReference(value: JsonValue): value is JsonObject {
  return isJsonObject(value) && typeof value[SECRET_REFERENCE_OBJECT_KEY] === 'string';
}

function parseResponseBody(body: Buffer, headers: Readonly<Record<string, string>>): JsonValue {
  if (body.byteLength === 0) {
    return null;
  }

  const contentType = headers['content-type'] ?? '';
  const text = body.toString('utf8');

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      throw new ConnectorHttpError({
        code: 'HTTP_CONNECTOR_RESPONSE_INVALID_JSON',
        category: 'validation',
        message: 'HTTP connector response body could not be parsed as JSON',
        retryable: false,
      });
    }
  }

  return text;
}

function readResponseBodyPath(body: JsonValue, path: string): JsonValue {
  let current: JsonValue = body;

  for (const segment of path.split('.')) {
    if (!isJsonObject(current) || Array.isArray(current) || !(segment in current)) {
      throw new ConnectorHttpError({
        code: 'HTTP_CONNECTOR_RESPONSE_MAPPING_FAILED',
        category: 'validation',
        message: 'HTTP connector response mapping could not be resolved',
        retryable: false,
        details: { path },
      });
    }

    const nextValue = current[segment];

    if (nextValue === undefined) {
      throw new ConnectorHttpError({
        code: 'HTTP_CONNECTOR_RESPONSE_MAPPING_FAILED',
        category: 'validation',
        message: 'HTTP connector response mapping could not be resolved',
        retryable: false,
        details: { path },
      });
    }

    current = nextValue;
  }

  return current;
}

function readProxyConfig(targetUrl: URL): ProxyConfig | undefined {
  if (matchesNoProxy(targetUrl.hostname)) {
    return undefined;
  }

  const rawProxy =
    targetUrl.protocol === 'https:'
      ? process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy
      : process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        process.env.HTTPS_PROXY ||
        process.env.https_proxy;

  if (!rawProxy || rawProxy.trim().length === 0) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(rawProxy.trim());
  } catch {
    throw new ConnectorHttpError({
      code: 'HTTP_CONNECTOR_PROXY_INVALID',
      category: 'validation',
      message: 'HTTP connector proxy configuration is invalid',
      retryable: false,
    });
  }

  if (url.protocol !== 'http:') {
    throw new ConnectorHttpError({
      code: 'HTTP_CONNECTOR_PROXY_INVALID',
      category: 'validation',
      message: 'HTTP connector proxy must use HTTP',
      retryable: false,
    });
  }

  const authorizationHeader =
    url.username || url.password
      ? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`, 'utf8').toString('base64')}`
      : undefined;
  url.username = '';
  url.password = '';

  return { url, authorizationHeader };
}

function matchesNoProxy(hostname: string): boolean {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;

  if (!noProxy) {
    return false;
  }

  const normalizedHostname = normalizeHostname(hostname);

  return noProxy
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === '*') {
        return true;
      }

      const normalizedEntry = normalizeHostname(entry);

      if (normalizedEntry.startsWith('.')) {
        return normalizedHostname.endsWith(normalizedEntry);
      }

      return (
        normalizedHostname === normalizedEntry || normalizedHostname.endsWith(`.${normalizedEntry}`)
      );
    });
}

async function performNodeRequestThroughProxy(input: {
  readonly request: PreparedRequest;
  readonly proxy: ProxyConfig;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly responseBodyLimit: number;
}): Promise<Omit<RequestExecutionResult, 'redirectCount' | 'redirected'>> {
  if (input.request.url.protocol === 'https:') {
    return await performHttpsRequestThroughHttpProxy(input);
  }

  return await performHttpRequestThroughHttpProxy(input);
}

async function performHttpRequestThroughHttpProxy(input: {
  readonly request: PreparedRequest;
  readonly proxy: ProxyConfig;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly responseBodyLimit: number;
}): Promise<Omit<RequestExecutionResult, 'redirectCount' | 'redirected'>> {
  const headers = {
    ...input.request.headers,
    host: input.request.url.host,
    ...(input.proxy.authorizationHeader
      ? { 'proxy-authorization': input.proxy.authorizationHeader }
      : {}),
  };

  return await performNodeRequestToUrl({
    request: input.request,
    requestUrl: input.proxy.url,
    method: input.request.method,
    headers,
    path: input.request.url.href,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    responseBodyLimit: input.responseBodyLimit,
    finalUrl: input.request.url,
    transport: 'http',
  });
}

async function performHttpsRequestThroughHttpProxy(input: {
  readonly request: PreparedRequest;
  readonly proxy: ProxyConfig;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly responseBodyLimit: number;
}): Promise<Omit<RequestExecutionResult, 'redirectCount' | 'redirected'>> {
  const tunnel = await createHttpProxyTunnel({
    targetUrl: input.request.url,
    proxy: input.proxy,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
  const tlsSocket = await createTlsSocketFromTunnel({
    socket: tunnel,
    servername: input.request.url.hostname,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });

  return await performNodeRequestToUrl({
    request: input.request,
    requestUrl: input.request.url,
    method: input.request.method,
    headers: withHostHeader(input.request.headers, input.request.url),
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    responseBodyLimit: input.responseBodyLimit,
    finalUrl: input.request.url,
    transport: 'https',
    createConnection: () => tlsSocket,
  });
}

function createHttpProxyTunnel(input: {
  readonly targetUrl: URL;
  readonly proxy: ProxyConfig;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}): Promise<Socket> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(
        new ConnectorHttpError({
          code: 'HTTP_CONNECTOR_TIMEOUT',
          category: 'timeout',
          message: 'HTTP connector request timed out',
          retryable: true,
        }),
      );
      return;
    }

    const proxyPort = Number(input.proxy.url.port || defaultPort(input.proxy.url.protocol));
    const targetPort = input.targetUrl.port || defaultPort(input.targetUrl.protocol);
    const targetAuthority = `${input.targetUrl.hostname}:${targetPort}`;
    const socket = netConnect({ host: input.proxy.url.hostname, port: proxyPort });
    let responseBuffer = Buffer.alloc(0);
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      reject(error);
    };

    const abort = () => {
      fail(
        new ConnectorHttpError({
          code: 'HTTP_CONNECTOR_TIMEOUT',
          category: 'timeout',
          message: 'HTTP connector request timed out',
          retryable: true,
        }),
      );
    };

    const cleanup = () => {
      input.signal.removeEventListener('abort', abort);
      socket.setTimeout(0);
    };

    input.signal.addEventListener('abort', abort, { once: true });
    socket.setTimeout(input.timeoutMs, abort);

    socket.once('connect', () => {
      const lines = [
        `CONNECT ${targetAuthority} HTTP/1.1`,
        `Host: ${targetAuthority}`,
        'Proxy-Connection: Keep-Alive',
      ];

      if (input.proxy.authorizationHeader) {
        lines.push(`Proxy-Authorization: ${input.proxy.authorizationHeader}`);
      }

      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    });

    socket.on('data', (chunk: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      const headerEnd = responseBuffer.indexOf('\r\n\r\n');

      if (headerEnd === -1 && responseBuffer.byteLength <= 8192) {
        return;
      }

      if (headerEnd === -1) {
        cleanup();
        fail(
          new ConnectorHttpError({
            code: 'HTTP_CONNECTOR_PROXY_INVALID',
            category: 'network',
            message: 'HTTP connector proxy response was invalid',
            retryable: true,
          }),
        );
        return;
      }

      const responseHead = responseBuffer.subarray(0, headerEnd).toString('latin1');
      const statusCode = Number(responseHead.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/)?.[1] ?? 0);
      const remaining = responseBuffer.subarray(headerEnd + 4);

      cleanup();
      socket.removeAllListeners('data');

      if (statusCode < 200 || statusCode >= 300) {
        fail(
          new ConnectorHttpError({
            code: 'HTTP_CONNECTOR_PROXY_REJECTED',
            category: 'network',
            message: `HTTP connector proxy rejected the tunnel with status ${statusCode}`,
            retryable: statusCode === 0 || statusCode >= 500,
          }),
        );
        return;
      }

      if (remaining.byteLength > 0) {
        socket.unshift(remaining);
      }

      settled = true;
      resolve(socket);
    });

    socket.once('error', (error) => {
      cleanup();
      fail(error);
    });
  });
}

function createTlsSocketFromTunnel(input: {
  readonly socket: Socket;
  readonly servername: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}): Promise<Socket> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      input.socket.destroy();
      reject(
        new ConnectorHttpError({
          code: 'HTTP_CONNECTOR_TIMEOUT',
          category: 'timeout',
          message: 'HTTP connector request timed out',
          retryable: true,
        }),
      );
      return;
    }

    const socket = tlsConnect({ socket: input.socket, servername: input.servername });
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      reject(error);
    };

    const abort = () => {
      fail(
        new ConnectorHttpError({
          code: 'HTTP_CONNECTOR_TIMEOUT',
          category: 'timeout',
          message: 'HTTP connector request timed out',
          retryable: true,
        }),
      );
    };

    const cleanup = () => {
      input.signal.removeEventListener('abort', abort);
      socket.setTimeout(0);
    };

    input.signal.addEventListener('abort', abort, { once: true });
    socket.setTimeout(input.timeoutMs, abort);

    socket.once('secureConnect', () => {
      cleanup();
      settled = true;
      resolve(socket);
    });

    socket.once('error', (error) => {
      cleanup();
      fail(error);
    });
  });
}

async function performNodeRequestWithSafeLookup(input: {
  readonly request: PreparedRequest;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly responseBodyLimit: number;
}): Promise<Omit<RequestExecutionResult, 'redirectCount' | 'redirected'>> {
  return await performNodeRequestToUrl({
    request: input.request,
    requestUrl: input.request.url,
    method: input.request.method,
    headers: withHostHeader(input.request.headers, input.request.url),
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    responseBodyLimit: input.responseBodyLimit,
    finalUrl: input.request.url,
    transport: input.request.url.protocol === 'https:' ? 'https' : 'http',
    lookup: createSafeRuntimeLookup(input.request.url.hostname),
  });
}

type SafeLookupAddress = {
  readonly address: string;
  readonly family: 4 | 6;
};

type SafeLookupOptions =
  | number
  | {
      readonly all?: boolean;
      readonly family?: number;
      readonly hints?: number;
      readonly verbatim?: boolean;
    };

type SafeLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | readonly SafeLookupAddress[],
  family?: number,
) => void;

function createSafeRuntimeLookup(hostname: string): RequestOptions['lookup'] {
  const expectedHostname = normalizeHostname(hostname);

  const safeLookup = (
    requestedHostname: string,
    options: SafeLookupOptions,
    callback: SafeLookupCallback,
  ): void => {
    const normalizedRequestedHostname = normalizeHostname(requestedHostname);

    if (normalizedRequestedHostname !== expectedHostname) {
      callback(
        toLookupError(
          new ConnectorHttpError({
            code: 'HTTP_CONNECTOR_DNS_RESOLUTION_FAILED',
            category: 'network',
            message: 'HTTP connector DNS lookup host mismatch',
            retryable: true,
          }),
        ),
        '',
        0,
      );
      return;
    }

    const normalizedOptions = normalizeSafeLookupOptions(options);

    if (normalizedOptions.all === true) {
      nodeLookup(expectedHostname, normalizedOptions, (error, records) => {
        if (error) {
          callback(error, '', 0);
          return;
        }

        try {
          const safeRecords = records.map((record) => normalizeSafeLookupAddress(record));

          for (const record of safeRecords) {
            assertPublicIpAddress(record.address);
          }

          callback(null, safeRecords);
        } catch (lookupError) {
          callback(toLookupError(lookupError), '', 0);
        }
      });
      return;
    }

    nodeLookup(expectedHostname, normalizedOptions, (error, address, family) => {
      if (error) {
        callback(error, '', 0);
        return;
      }

      try {
        const safeRecord = normalizeSafeLookupAddress({ address, family });
        assertPublicIpAddress(safeRecord.address);
        callback(null, safeRecord.address, safeRecord.family);
      } catch (lookupError) {
        callback(toLookupError(lookupError), '', 0);
      }
    });
  };

  return safeLookup as RequestOptions['lookup'];
}

function normalizeSafeLookupOptions(
  options: SafeLookupOptions,
): LookupAllOptions | LookupOneOptions {
  if (typeof options === 'number') {
    return { family: normalizeSafeLookupFamily(options), verbatim: false };
  }

  const family = typeof options.family === 'number' ? normalizeSafeLookupFamily(options.family) : 0;

  if (options.all === true) {
    return {
      all: true,
      family,
      ...(typeof options.hints === 'number' ? { hints: options.hints } : {}),
      verbatim: false,
    };
  }

  return {
    all: false,
    family,
    ...(typeof options.hints === 'number' ? { hints: options.hints } : {}),
    verbatim: false,
  };
}

function normalizeSafeLookupFamily(family: number): 0 | 4 | 6 {
  if (family === 4 || family === 6) {
    return family;
  }

  return 0;
}

function normalizeSafeLookupAddress(record: {
  readonly address: string;
  readonly family: number;
}): SafeLookupAddress {
  const address = typeof record.address === 'string' ? record.address.trim() : '';
  const family = isIP(address);

  if ((family !== 4 && family !== 6) || record.family !== family) {
    throw new ConnectorHttpError({
      code: 'HTTP_CONNECTOR_DNS_RESOLUTION_FAILED',
      category: 'network',
      message: 'HTTP connector DNS returned an invalid address',
      retryable: true,
    });
  }

  return { address, family };
}

function toLookupError(error: unknown): NodeJS.ErrnoException {
  if (error instanceof Error) {
    return error as NodeJS.ErrnoException;
  }

  return new Error('HTTP connector DNS lookup failed') as NodeJS.ErrnoException;
}

function withHostHeader(
  headers: Readonly<Record<string, string>>,
  url: URL,
): Readonly<Record<string, string>> {
  if ('host' in headers) {
    return headers;
  }

  return { ...headers, host: url.host };
}

function performNodeRequestToUrl(input: {
  readonly request: PreparedRequest;
  readonly requestUrl: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly responseBodyLimit: number;
  readonly finalUrl: URL;
  readonly transport: 'http' | 'https';
  readonly path?: string;
  readonly lookup?: RequestOptions['lookup'];
  readonly createConnection?: RequestOptions['createConnection'];
}): Promise<Omit<RequestExecutionResult, 'redirectCount' | 'redirected'>> {
  return new Promise((resolve, reject) => {
    const handleResponse = (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.byteLength;

        if (totalBytes > input.responseBodyLimit) {
          req.destroy(
            new ConnectorHttpError({
              code: 'HTTP_CONNECTOR_RESPONSE_TOO_LARGE',
              category: 'validation',
              message: 'HTTP connector response body exceeds the maximum accepted size',
              retryable: false,
            }),
          );
          return;
        }

        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          finalUrl: input.finalUrl,
          statusCode: res.statusCode ?? 0,
          headers: normalizeResponseHeaders(res.headers),
          body: Buffer.concat(chunks),
        });
      });
    };
    const requestOptions: RequestOptions = {
      method: input.method,
      headers: input.headers,
      signal: input.signal,
      timeout: input.timeoutMs,
      ...(input.path ? { path: input.path } : {}),
      ...(input.lookup ? { lookup: input.lookup } : {}),
      ...(input.createConnection ? { createConnection: input.createConnection, agent: false } : {}),
    };
    const req =
      input.transport === 'https'
        ? httpsRequest(input.requestUrl, requestOptions, handleResponse)
        : httpRequest(input.requestUrl, requestOptions, handleResponse);

    req.on('timeout', () => {
      req.destroy(
        new ConnectorHttpError({
          code: 'HTTP_CONNECTOR_TIMEOUT',
          category: 'timeout',
          message: 'HTTP connector request timed out',
          retryable: true,
        }),
      );
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (input.request.body) {
      req.write(input.request.body);
    }

    req.end();
  });
}

async function resolveAllowedAddresses(hostname: string): Promise<readonly string[]> {
  const normalizedHostname = normalizeHostname(hostname);

  if (isIP(normalizedHostname) !== 0) {
    assertPublicIpAddress(normalizedHostname);
    return [normalizedHostname];
  }

  const records = await lookupAsync(normalizedHostname, { all: true, verbatim: false });
  const addresses = records
    .map((record) => (typeof record.address === 'string' ? record.address.trim() : ''))
    .filter(Boolean);

  if (addresses.length === 0) {
    throw new ConnectorHttpError({
      code: 'HTTP_CONNECTOR_DNS_RESOLUTION_FAILED',
      category: 'network',
      message: 'HTTP connector DNS resolution failed',
      retryable: true,
    });
  }

  for (const address of addresses) {
    assertPublicIpAddress(address);
  }

  return sortResolvedAddresses([...new Set(addresses)]);
}

function sortResolvedAddresses(addresses: readonly string[]): readonly string[] {
  return [...addresses].sort((left, right) => {
    const leftFamily = isIP(left);
    const rightFamily = isIP(right);

    if (leftFamily === rightFamily) {
      return left.localeCompare(right);
    }

    if (leftFamily === 4) {
      return -1;
    }

    if (rightFamily === 4) {
      return 1;
    }

    return 0;
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isRetryableAddressAttemptError(error: unknown): boolean {
  if (error instanceof ConnectorHttpError) {
    return error.code === 'HTTP_CONNECTOR_TIMEOUT';
  }

  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  return NETWORK_ERROR_CODES.has(String((error as { readonly code?: unknown }).code));
}

function assertPublicIpAddress(address: string): void {
  const version = isIP(address);

  if (version === 0) {
    throw httpConnectorUrlBlocked('HTTP connector DNS returned an invalid address');
  }

  if (version === 4 && isBlockedIpv4(address)) {
    throw httpConnectorUrlBlocked('HTTP connector DNS returned a blocked address');
  }

  if (version === 6 && isBlockedIpv6(address)) {
    throw httpConnectorUrlBlocked('HTTP connector DNS returned a blocked address');
  }
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  const [first = -1, second = -1, third = -1, fourth = -1] = parts;

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    (first === 255 && second === 255 && third === 255 && fourth === 255)
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalizedAddress = address.toLowerCase();

  return (
    normalizedAddress === '::' ||
    normalizedAddress === '::1' ||
    normalizedAddress.startsWith('fc') ||
    normalizedAddress.startsWith('fd') ||
    normalizedAddress.startsWith('fe80:') ||
    normalizedAddress.startsWith('ff') ||
    normalizedAddress.startsWith('::ffff:10.') ||
    normalizedAddress.startsWith('::ffff:127.') ||
    normalizedAddress.startsWith('::ffff:169.254.') ||
    normalizedAddress.startsWith('::ffff:172.16.') ||
    normalizedAddress.startsWith('::ffff:172.17.') ||
    normalizedAddress.startsWith('::ffff:172.18.') ||
    normalizedAddress.startsWith('::ffff:172.19.') ||
    normalizedAddress.startsWith('::ffff:172.2') ||
    normalizedAddress.startsWith('::ffff:172.30.') ||
    normalizedAddress.startsWith('::ffff:172.31.') ||
    normalizedAddress.startsWith('::ffff:192.168.')
  );
}

function normalizeResponseHeaders(
  headers: NodeJS.Dict<string | string[]>,
): Readonly<Record<string, string>> {
  const normalizedHeaders: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!value) {
      continue;
    }

    const normalizedValue = Array.isArray(value) ? value.join(', ') : value;
    normalizedHeaders[name.toLowerCase()] = normalizedValue.slice(
      0,
      RESPONSE_HEADER_VALUE_MAX_LENGTH,
    );
  }

  return normalizedHeaders;
}

function classifyConnectorError(error: unknown): ConnectorExecutionError {
  if (error instanceof ConnectorHttpError) {
    return {
      code: error.code,
      category: error.category,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  if (error && typeof error === 'object' && 'code' in error && String(error.code) === 'ABORT_ERR') {
    return {
      code: 'HTTP_CONNECTOR_TIMEOUT',
      category: 'timeout',
      message: 'HTTP connector request timed out',
      retryable: true,
    };
  }

  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    String(error.code).startsWith('HTTP_CONNECTOR_')
  ) {
    const domainError = error as {
      readonly code: string;
      readonly message?: string;
      readonly category?: string;
    };
    return {
      code: domainError.code,
      category: domainError.category === 'authentication' ? 'authentication' : 'validation',
      message: domainError.message ?? 'HTTP connector request failed',
      retryable: false,
    };
  }

  return {
    code: 'HTTP_CONNECTOR_NETWORK_ERROR',
    category: 'network',
    message:
      error instanceof Error && error.message
        ? error.message
        : 'HTTP connector network request failed',
    retryable: true,
  };
}

function matchesAllowlistEntry(url: URL, entry: string): boolean {
  const normalizedEntry = entry.trim();

  if (!normalizedEntry) {
    return false;
  }

  try {
    const parsedEntry = new URL(normalizedEntry);
    const sameProtocol = parsedEntry.protocol === url.protocol;
    const sameHost = normalizeHostname(parsedEntry.hostname) === normalizeHostname(url.hostname);
    const samePort =
      (parsedEntry.port || defaultPort(parsedEntry.protocol)) ===
      (url.port || defaultPort(url.protocol));
    const pathAllowed =
      parsedEntry.pathname === '/' || url.pathname.startsWith(parsedEntry.pathname);

    return sameProtocol && sameHost && samePort && pathAllowed;
  } catch {
    return normalizeHostname(url.hostname) === normalizeHostname(normalizedEntry);
  }
}

function defaultPort(protocol: string): string {
  return protocol === 'https:' ? '443' : '80';
}

function maskUrlForOutput(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
