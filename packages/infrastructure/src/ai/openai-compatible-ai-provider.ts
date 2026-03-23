import { request as httpRequest } from 'node:http';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import type { AiProviderPort } from '@runlane/application';
import { RuntimeConfigService } from '@runlane/config';
import type {
  AiProviderMessage,
  AiStructuredObjectSchema,
  AiProviderStructuredResponseError,
  AiProviderStructuredResponseRequest,
  AiProviderStructuredResponseResult,
  AiProviderUsage,
  JsonObject,
  JsonValue,
} from '@runlane/contracts';
import {
  aiProviderConfigInvalid,
  aiProviderResponseInvalid,
  isDomainError,
  readAiProviderMessages,
  readAiStructuredObjectSchema,
  validateAiStructuredResponse,
} from '@runlane/domain';

interface OpenAiProviderOptions {
  readonly provider: string;
  readonly apiKey: string | null;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
}

interface JsonHttpResponse {
  readonly statusCode: number;
  readonly body: JsonValue;
}

interface OpenAiChatCompletionResponse {
  readonly [key: string]: unknown;
  readonly id?: string;
  readonly model?: string;
  readonly choices?: readonly JsonValue[];
  readonly usage?: JsonObject;
}

const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;
const AI_RESPONSE_MAX_BYTES = 1048576;
const AI_MESSAGE_CONTENT_MAX_LENGTH = 120000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
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
]);

@Injectable()
export class OpenAiCompatibleProvider implements AiProviderPort {
  private readonly options: OpenAiProviderOptions;

  constructor(@Inject(RuntimeConfigService) config: RuntimeConfigService) {
    this.options = {
      provider: config.aiProvider,
      apiKey: config.aiApiKey,
      baseUrl: config.aiBaseUrl,
      model: config.aiModel,
      timeoutMs: config.aiTimeoutMs,
    };
  }

  async generateStructuredResponse(
    input: AiProviderStructuredResponseRequest,
  ): Promise<AiProviderStructuredResponseResult> {
    try {
      if (this.options.provider !== 'openai_compatible') {
        return failed({
          code: 'AI_PROVIDER_UNSUPPORTED',
          category: 'configuration',
          message: 'Configured AI provider is not supported',
          retryable: false,
        });
      }

      if (!this.options.apiKey) {
        return failed({
          code: 'AI_PROVIDER_API_KEY_MISSING',
          category: 'configuration',
          message: 'AI provider API key is not configured',
          retryable: false,
        });
      }

      const messages = readAiProviderMessages(input.messages);
      const schema = readAiStructuredObjectSchema(input.schema);
      const response = await requestJson({
        url: buildChatCompletionsUrl(this.options.baseUrl),
        apiKey: this.options.apiKey,
        timeoutMs: readTimeoutMs(input.timeoutMs, this.options.timeoutMs),
        body: buildChatCompletionPayload({
          messages,
          schema,
          model: input.model ?? this.options.model,
          temperature: readTemperature(input.temperature),
          maxOutputTokens: readMaxOutputTokens(input.maxOutputTokens),
        }),
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return failed(mapHttpStatusToError(response.statusCode, response.body));
      }

      const rawResponse = readOpenAiChatCompletionResponse(response.body);
      const rawText = extractAssistantContent(rawResponse);
      const parsedOutput = parseAssistantJson(rawText);
      const output = validateAiStructuredResponse(parsedOutput, schema);

      return {
        status: 'succeeded',
        model:
          typeof rawResponse.model === 'string'
            ? rawResponse.model
            : (input.model ?? this.options.model),
        output,
        rawText,
        usage: readUsage(rawResponse.usage),
      };
    } catch (error) {
      return failed(mapUnknownErrorToAiError(error));
    }
  }
}

function buildChatCompletionsUrl(baseUrl: string): URL {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('chat/completions', normalizedBaseUrl);
}

function buildChatCompletionPayload(input: {
  readonly messages: readonly AiProviderMessage[];
  readonly schema: AiStructuredObjectSchema;
  readonly model: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
}): JsonObject {
  const schemaInstruction = JSON.stringify(input.schema);
  const messages = [
    {
      role: 'system',
      content: `Return only a valid JSON object that conforms to this JSON schema. Do not include markdown or prose. Schema: ${schemaInstruction}`,
    },
    ...input.messages,
  ];

  return {
    model: input.model,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    temperature: input.temperature,
    max_tokens: input.maxOutputTokens,
    response_format: {
      type: 'json_object',
    },
  };
}

function requestJson(input: {
  readonly url: URL;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly body: JsonObject;
}): Promise<JsonHttpResponse> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(input.body), 'utf8');
    const requestOptions: RequestOptions = {
      protocol: input.url.protocol,
      hostname: input.url.hostname,
      port: input.url.port ? Number(input.url.port) : input.url.protocol === 'https:' ? 443 : 80,
      path: `${input.url.pathname}${input.url.search}`,
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${input.apiKey}`,
        'content-length': String(body.byteLength),
        'content-type': 'application/json',
        'user-agent': 'Runlane-AiProvider/1.0',
      },
    };
    const handleResponse = (response: IncomingMessage): void => {
      collectResponseBody(response)
        .then((responseBody) => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: parseJsonBody(responseBody),
          });
        })
        .catch((error: unknown) => reject(error));
    };
    const request =
      input.url.protocol === 'https:'
        ? httpsRequest(requestOptions, handleResponse)
        : httpRequest(requestOptions, handleResponse);

    request.setTimeout(input.timeoutMs, () => {
      request.destroy(new TimeoutError('AI provider request timed out'));
    });
    request.on('error', (error: Error) => reject(error));
    request.end(body);
  });
}

function collectResponseBody(response: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    response.on('data', (chunk: Buffer | string) => {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += chunkBuffer.byteLength;

      if (totalBytes > AI_RESPONSE_MAX_BYTES) {
        reject(new Error('AI provider response exceeded maximum size'));
        response.destroy();
        return;
      }

      chunks.push(chunkBuffer);
    });
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', (error: Error) => reject(error));
  });
}

function parseJsonBody(body: Buffer): JsonValue {
  const text = body.toString('utf8').trim();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    throw aiProviderResponseInvalid('AI provider returned invalid JSON');
  }
}

function readOpenAiChatCompletionResponse(value: JsonValue): OpenAiChatCompletionResponse {
  if (!isPlainObject(value)) {
    throw aiProviderResponseInvalid('AI provider response must be a JSON object');
  }

  return value as OpenAiChatCompletionResponse;
}

function extractAssistantContent(response: OpenAiChatCompletionResponse): string {
  const firstChoice = Array.isArray(response.choices) ? response.choices[0] : undefined;

  if (!isPlainObject(firstChoice)) {
    throw aiProviderResponseInvalid('AI provider response does not include choices');
  }

  const message = firstChoice.message;

  if (!isPlainObject(message)) {
    throw aiProviderResponseInvalid('AI provider response choice does not include a message');
  }

  const content = message.content;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw aiProviderResponseInvalid('AI provider response message content is empty');
  }

  if (content.length > AI_MESSAGE_CONTENT_MAX_LENGTH) {
    throw aiProviderResponseInvalid('AI provider response message content is too large');
  }

  return content.trim();
}

function parseAssistantJson(value: string): unknown {
  const normalizedValue = stripJsonCodeFence(value);

  try {
    return JSON.parse(normalizedValue) as unknown;
  } catch {
    throw aiProviderResponseInvalid('AI provider structured response is not valid JSON');
  }
}

function stripJsonCodeFence(value: string): string {
  const trimmedValue = value.trim();
  const jsonFenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmedValue);

  return jsonFenceMatch?.[1]?.trim() ?? trimmedValue;
}

function readUsage(value: unknown): AiProviderUsage {
  if (!isPlainObject(value)) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  const inputTokens = readTokenCount(value.prompt_tokens);
  const outputTokens = readTokenCount(value.completion_tokens);
  const totalTokens = readTokenCount(value.total_tokens) || inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function readTokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

function readTemperature(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_TEMPERATURE;
  }

  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw aiProviderConfigInvalid('AI provider temperature is invalid');
  }

  return value;
}

function readMaxOutputTokens(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }

  if (!Number.isInteger(value) || value < 16 || value > 8192) {
    throw aiProviderConfigInvalid('AI provider max output tokens is invalid');
  }

  return value;
}

function readTimeoutMs(value: number | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value < 1000 || value > 120000) {
    throw aiProviderConfigInvalid('AI provider timeout is invalid');
  }

  return value;
}

function mapHttpStatusToError(
  statusCode: number,
  body: JsonValue,
): AiProviderStructuredResponseError {
  const providerMessage = readProviderErrorMessage(body);

  if (statusCode === 401) {
    return {
      code: 'AI_PROVIDER_AUTHENTICATION_FAILED',
      category: 'authentication',
      message: providerMessage ?? 'AI provider authentication failed',
      retryable: false,
    };
  }

  if (statusCode === 403) {
    return {
      code: 'AI_PROVIDER_AUTHORIZATION_FAILED',
      category: 'authorization',
      message: providerMessage ?? 'AI provider authorization failed',
      retryable: false,
    };
  }

  if (statusCode === 429) {
    return {
      code: 'AI_PROVIDER_RATE_LIMITED',
      category: 'rate_limit',
      message: providerMessage ?? 'AI provider rate limit was reached',
      retryable: true,
    };
  }

  if (RETRYABLE_STATUS_CODES.has(statusCode)) {
    return {
      code: 'AI_PROVIDER_TEMPORARY_FAILURE',
      category: statusCode >= 500 ? 'remote' : 'timeout',
      message: providerMessage ?? `AI provider returned HTTP ${statusCode}`,
      retryable: true,
    };
  }

  return {
    code: `AI_PROVIDER_HTTP_${statusCode}`,
    category: 'validation',
    message: providerMessage ?? `AI provider returned HTTP ${statusCode}`,
    retryable: false,
  };
}

function readProviderErrorMessage(body: JsonValue): string | null {
  if (!isPlainObject(body)) {
    return null;
  }

  const error = body.error;

  if (
    isPlainObject(error) &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return error.message.trim();
  }

  if (typeof body.message === 'string' && body.message.trim().length > 0) {
    return body.message.trim();
  }

  return null;
}

function mapUnknownErrorToAiError(error: unknown): AiProviderStructuredResponseError {
  if (isDomainError(error)) {
    return {
      code: error.code,
      category: 'validation',
      message: error.message,
      retryable: false,
    };
  }

  if (error instanceof TimeoutError) {
    return {
      code: 'AI_PROVIDER_TIMEOUT',
      category: 'timeout',
      message: error.message,
      retryable: true,
    };
  }

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code && NETWORK_ERROR_CODES.has(nodeError.code)) {
      return {
        code: 'AI_PROVIDER_NETWORK_ERROR',
        category: 'network',
        message: 'AI provider network request failed',
        retryable: true,
      };
    }

    return {
      code: 'AI_PROVIDER_REQUEST_FAILED',
      category: 'unknown',
      message: error.message || 'AI provider request failed',
      retryable: false,
    };
  }

  return {
    code: 'AI_PROVIDER_REQUEST_FAILED',
    category: 'unknown',
    message: 'AI provider request failed',
    retryable: false,
  };
}

function failed(error: AiProviderStructuredResponseError): AiProviderStructuredResponseResult {
  return {
    status: 'failed',
    error,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
