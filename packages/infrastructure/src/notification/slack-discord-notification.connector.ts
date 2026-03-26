import { Inject, Injectable } from '@nestjs/common';
import {
  buildConnectorCredentialAssociatedData,
  CONNECTOR_CREDENTIAL_REPOSITORY,
  SECRET_CIPHER,
} from '@runlane/application';
import type {
  ConnectorCredentialRepositoryPort,
  NotificationConnectorPort,
  SecretCipherPort,
} from '@runlane/application';
import { RuntimeConfigService } from '@runlane/config';
import type {
  ConnectorExecutionError,
  ConnectorExecutionResult,
  ExecutionFailureNotificationInput,
  JsonObject,
  NotificationConnectorResult,
  NotificationExecutionInput,
} from '@runlane/contracts';
import {
  notificationWebhookInvalid,
  notificationWebhookMissing,
  readNotificationStepConfig,
} from '@runlane/domain';
import type { NotificationProvider, NotificationSeverity } from '@runlane/domain';
import { StructuredLoggerService } from '../observability';

interface NotificationRuntimeOptions {
  readonly slackWebhookUrl: string | null;
  readonly discordWebhookUrl: string | null;
  readonly timeoutMs: number;
  readonly maxPayloadBytes: number;
  readonly failureAlertsEnabled: boolean;
}

interface ResolvedWebhook {
  readonly provider: NotificationProvider;
  readonly url: URL;
  readonly source: 'credential' | 'environment';
}

interface WebhookDeliveryResult {
  readonly statusCode: number;
  readonly bodyPreview: string;
  readonly durationMs: number;
}

interface NotificationPayloadContext {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly executionId: string;
  readonly stepKey: string | undefined;
  readonly attempt: number | undefined;
  readonly correlationId: string | undefined;
  readonly status: string | undefined;
}

const SLACK_ALLOWED_HOSTS = new Set(['hooks.slack.com', 'hooks.slack-gov.com']);
const DISCORD_ALLOWED_HOSTS = new Set(['discord.com', 'discordapp.com']);
const USER_AGENT = 'Runlane-NotificationConnector/1.0';
const RESPONSE_PREVIEW_MAX_LENGTH = 512;

@Injectable()
export class SlackDiscordNotificationConnector implements NotificationConnectorPort {
  private readonly options: NotificationRuntimeOptions;

  constructor(
    @Inject(RuntimeConfigService) config: RuntimeConfigService,
    @Inject(CONNECTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ConnectorCredentialRepositoryPort,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipherPort,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
  ) {
    this.options = {
      slackWebhookUrl: config.slackWebhookUrl,
      discordWebhookUrl: config.discordWebhookUrl,
      timeoutMs: config.notificationConnectorTimeoutMs,
      maxPayloadBytes: config.notificationConnectorMaxPayloadBytes,
      failureAlertsEnabled: config.notificationFailureAlertsEnabled,
    };
  }

  async execute(input: NotificationExecutionInput): Promise<ConnectorExecutionResult> {
    const startedAt = Date.now();

    try {
      const config = readNotificationStepConfig(input.config);
      const webhook = await this.resolveWebhook({
        workspaceId: input.context.workspaceId,
        workflowId: input.context.workflowId,
        provider: config.provider,
        ...(config.credentialName ? { credentialName: config.credentialName } : {}),
      });
      const payload = buildProviderPayload({
        provider: config.provider,
        title: config.title,
        message: config.message,
        severity: config.severity,
        metadata: config.metadata,
        includeExecutionContext: config.includeExecutionContext,
        context: {
          workspaceId: input.context.workspaceId,
          workflowId: input.context.workflowId,
          executionId: input.context.executionId,
          stepKey: input.context.stepKey,
          attempt: input.context.attempt,
          correlationId: input.context.correlationId,
          status: input.context.executionStatus,
        },
      });
      const delivery = await deliverWebhook({
        url: webhook.url,
        payload,
        timeoutMs: this.options.timeoutMs,
        maxPayloadBytes: this.options.maxPayloadBytes,
      });
      const durationMs = Math.max(0, Date.now() - startedAt);

      return {
        status: 'succeeded',
        output: {
          provider: config.provider,
          delivered: true,
          source: webhook.source,
          statusCode: delivery.statusCode,
          durationMs,
        },
        usage: [{ type: 'notification', quantity: 1 }],
      };
    } catch (error) {
      return {
        status: 'failed',
        error: classifyNotificationError(error),
        usage: [{ type: 'notification', quantity: 1 }],
      };
    }
  }

  async sendExecutionFailureAlert(
    input: ExecutionFailureNotificationInput,
  ): Promise<readonly NotificationConnectorResult[]> {
    if (!this.options.failureAlertsEnabled) {
      return [];
    }

    const providers = this.failureAlertProviders();
    const results: NotificationConnectorResult[] = [];

    for (const provider of providers) {
      const result = await this.deliverFailureAlert(provider, input);
      results.push({ provider, result });
    }

    return results;
  }

  private async deliverFailureAlert(
    provider: NotificationProvider,
    input: ExecutionFailureNotificationInput,
  ): Promise<ConnectorExecutionResult> {
    try {
      const webhook = await this.resolveWebhook({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        provider,
      });
      const delivery = await deliverWebhook({
        url: webhook.url,
        payload: buildProviderPayload({
          provider,
          title:
            input.status === 'dead_letter' ? 'Execution moved to dead letter' : 'Execution failed',
          message: `${input.errorCode}: ${input.errorMessage}`,
          severity: 'error',
          metadata: {
            jobId: input.jobId,
            durationMs: input.durationMs,
            maxAttempts: input.maxAttempts,
          },
          includeExecutionContext: true,
          context: {
            workspaceId: input.workspaceId,
            workflowId: input.workflowId,
            executionId: input.executionId,
            stepKey: undefined,
            attempt: input.attempt,
            correlationId: input.correlationId,
            status: input.status,
          },
        }),
        timeoutMs: this.options.timeoutMs,
        maxPayloadBytes: this.options.maxPayloadBytes,
      });

      return {
        status: 'succeeded',
        output: {
          provider,
          delivered: true,
          source: webhook.source,
          statusCode: delivery.statusCode,
          durationMs: delivery.durationMs,
        },
        usage: [{ type: 'notification', quantity: 1 }],
      };
    } catch (error) {
      const classifiedError = classifyNotificationError(error);
      this.logger.logEvent(
        classifiedError.retryable ? 'warn' : 'info',
        'Execution failure notification was not delivered',
        {
          provider,
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          executionId: input.executionId,
          errorCode: classifiedError.code,
          retryable: classifiedError.retryable,
        },
        SlackDiscordNotificationConnector.name,
      );

      return {
        status: 'failed',
        error: classifiedError,
        usage: [{ type: 'notification', quantity: 1 }],
      };
    }
  }

  private failureAlertProviders(): readonly NotificationProvider[] {
    const providers: NotificationProvider[] = [];

    if (this.options.slackWebhookUrl) {
      providers.push('slack');
    }

    if (this.options.discordWebhookUrl) {
      providers.push('discord');
    }

    return providers;
  }

  private async resolveWebhook(input: {
    readonly workspaceId: string;
    readonly workflowId: string;
    readonly provider: NotificationProvider;
    readonly credentialName?: string;
  }): Promise<ResolvedWebhook> {
    if (input.credentialName) {
      const credential = await this.credentials.findByName({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        name: input.credentialName,
      });

      if (!credential) {
        throw new NotificationConnectorError({
          code: 'NOTIFICATION_WEBHOOK_MISSING',
          category: 'validation',
          message: `Notification credential '${input.credentialName}' was not found`,
          retryable: false,
        });
      }

      if (credential.type !== 'webhook_url') {
        throw new NotificationConnectorError({
          code: 'NOTIFICATION_WEBHOOK_INVALID',
          category: 'validation',
          message: 'Notification credential must contain a webhook URL',
          retryable: false,
        });
      }

      const decryptedValue = await this.cipher.decrypt({
        ciphertext: credential.encryptedValue,
        associatedData: buildConnectorCredentialAssociatedData({
          workspaceId: credential.workspaceId,
          workflowId: credential.workflowId,
          name: credential.name,
          type: credential.type,
        }),
      });
      const url = readProviderWebhookUrl(input.provider, decryptedValue);

      return { provider: input.provider, url, source: 'credential' };
    }

    const configuredUrl =
      input.provider === 'slack' ? this.options.slackWebhookUrl : this.options.discordWebhookUrl;

    if (!configuredUrl) {
      throw notificationWebhookMissing(input.provider);
    }

    return {
      provider: input.provider,
      url: readProviderWebhookUrl(input.provider, configuredUrl),
      source: 'environment',
    };
  }
}

class NotificationConnectorError extends Error {
  readonly code: string;
  readonly category: ConnectorExecutionError['category'];
  readonly retryable: boolean;
  readonly details: JsonObject | undefined;

  constructor(input: ConnectorExecutionError) {
    super(input.message);
    this.name = 'NotificationConnectorError';
    this.code = input.code;
    this.category = input.category;
    this.retryable = input.retryable;
    this.details = input.details;
  }
}

function buildProviderPayload(input: {
  readonly provider: NotificationProvider;
  readonly title: string | undefined;
  readonly message: string;
  readonly severity: NotificationSeverity;
  readonly metadata: JsonObject | undefined;
  readonly includeExecutionContext: boolean;
  readonly context: NotificationPayloadContext;
}): JsonObject {
  if (input.provider === 'slack') {
    return buildSlackPayload(input);
  }

  return buildDiscordPayload(input);
}

function buildSlackPayload(input: {
  readonly title: string | undefined;
  readonly message: string;
  readonly severity: NotificationSeverity;
  readonly metadata: JsonObject | undefined;
  readonly includeExecutionContext: boolean;
  readonly context: NotificationPayloadContext;
}): JsonObject {
  const lines = [
    `*${input.title ?? defaultTitle(input.severity)}*`,
    input.message,
    ...(input.includeExecutionContext ? executionContextLines(input.context) : []),
  ];

  return {
    text: lines.join('\n'),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: lines.join('\n'),
        },
      },
      ...(input.metadata
        ? [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `metadata: ${JSON.stringify(input.metadata).slice(0, 1200)}`,
                },
              ],
            },
          ]
        : []),
    ],
  };
}

function buildDiscordPayload(input: {
  readonly title: string | undefined;
  readonly message: string;
  readonly severity: NotificationSeverity;
  readonly metadata: JsonObject | undefined;
  readonly includeExecutionContext: boolean;
  readonly context: NotificationPayloadContext;
}): JsonObject {
  const fields = input.includeExecutionContext ? executionContextFields(input.context) : [];

  return {
    content: input.message.slice(0, 1900),
    embeds: [
      {
        title: input.title ?? defaultTitle(input.severity),
        description: input.message,
        fields,
        ...(input.metadata
          ? { footer: { text: JSON.stringify(input.metadata).slice(0, 1800) } }
          : {}),
      },
    ],
  };
}

function defaultTitle(severity: NotificationSeverity): string {
  if (severity === 'error') {
    return 'Runlane error notification';
  }

  if (severity === 'warning') {
    return 'Runlane warning notification';
  }

  return 'Runlane notification';
}

function executionContextLines(context: NotificationPayloadContext): readonly string[] {
  return [
    `workspace: ${context.workspaceId}`,
    `workflow: ${context.workflowId}`,
    `execution: ${context.executionId}`,
    ...(context.stepKey ? [`step: ${context.stepKey}`] : []),
    ...(context.status ? [`status: ${context.status}`] : []),
    ...(context.attempt !== undefined ? [`attempt: ${context.attempt}`] : []),
    ...(context.correlationId ? [`correlation: ${context.correlationId}`] : []),
  ];
}

function executionContextFields(context: NotificationPayloadContext): readonly JsonObject[] {
  return executionContextLines(context).map((line) => {
    const [name = 'context', ...valueParts] = line.split(': ');

    return {
      name,
      value: valueParts.join(': '),
      inline: false,
    };
  });
}

async function deliverWebhook(input: {
  readonly url: URL;
  readonly payload: JsonObject;
  readonly timeoutMs: number;
  readonly maxPayloadBytes: number;
}): Promise<WebhookDeliveryResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const body = JSON.stringify(input.payload);
    const bodyBytes = Buffer.byteLength(body, 'utf8');

    if (bodyBytes > input.maxPayloadBytes) {
      throw new NotificationConnectorError({
        code: 'NOTIFICATION_PAYLOAD_TOO_LARGE',
        category: 'validation',
        message: 'Notification payload exceeds the maximum accepted size',
        retryable: false,
      });
    }

    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
      },
      body,
      signal: controller.signal,
    });
    const responseText = await response.text();
    const durationMs = Math.max(0, Date.now() - startedAt);

    if (response.status < 200 || response.status >= 300) {
      throw new NotificationConnectorError({
        code:
          response.status >= 500
            ? 'NOTIFICATION_DELIVERY_FAILED'
            : 'NOTIFICATION_DELIVERY_REJECTED',
        category: response.status >= 500 ? 'remote' : 'validation',
        message: `Notification webhook returned status ${response.status}`,
        retryable: response.status >= 500,
        details: {
          statusCode: response.status,
          durationMs,
          bodyPreview: responseText.slice(0, RESPONSE_PREVIEW_MAX_LENGTH),
        },
      });
    }

    return {
      statusCode: response.status,
      bodyPreview: responseText.slice(0, RESPONSE_PREVIEW_MAX_LENGTH),
      durationMs,
    };
  } catch (error) {
    if (error instanceof NotificationConnectorError) {
      throw error;
    }

    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      String(error.name) === 'AbortError'
    ) {
      throw new NotificationConnectorError({
        code: 'NOTIFICATION_DELIVERY_FAILED',
        category: 'timeout',
        message: 'Notification webhook delivery timed out',
        retryable: true,
      });
    }

    throw new NotificationConnectorError({
      code: 'NOTIFICATION_DELIVERY_FAILED',
      category: 'network',
      message: error instanceof Error ? error.message : 'Notification webhook delivery failed',
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function readProviderWebhookUrl(provider: NotificationProvider, value: string): URL {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw notificationWebhookInvalid(provider);
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw notificationWebhookInvalid(provider);
  }

  const hostname = url.hostname.toLowerCase();

  if (provider === 'slack') {
    if (!SLACK_ALLOWED_HOSTS.has(hostname) || !url.pathname.startsWith('/services/')) {
      throw notificationWebhookInvalid(provider);
    }

    return url;
  }

  if (!DISCORD_ALLOWED_HOSTS.has(hostname) || !url.pathname.startsWith('/api/webhooks/')) {
    throw notificationWebhookInvalid(provider);
  }

  return url;
}

function classifyNotificationError(error: unknown): ConnectorExecutionError {
  if (error instanceof NotificationConnectorError) {
    return {
      code: error.code,
      category: error.category,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const domainLikeError = error as {
      readonly code?: unknown;
      readonly category?: unknown;
      readonly message?: unknown;
      readonly details?: unknown;
    };
    const code =
      typeof domainLikeError.code === 'string' ? domainLikeError.code : 'NOTIFICATION_FAILED';

    return {
      code,
      category: domainLikeError.category === 'validation' ? 'validation' : 'unknown',
      message:
        typeof domainLikeError.message === 'string'
          ? domainLikeError.message
          : 'Notification delivery failed',
      retryable: false,
      ...(isJsonObject(domainLikeError.details) ? { details: domainLikeError.details } : {}),
    };
  }

  return {
    code: 'NOTIFICATION_DELIVERY_FAILED',
    category: 'unknown',
    message: 'Notification delivery failed',
    retryable: false,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
