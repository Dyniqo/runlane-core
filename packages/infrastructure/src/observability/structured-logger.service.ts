import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { RuntimeConfigService, type LogLevel } from '@runlane/config';
import type { RunlaneServiceName } from '@runlane/contracts';
import { sanitizeLogValue } from './log-sanitizer';
import { RUNLANE_SERVICE_NAME } from './observability.tokens';
import { RequestContextService } from './request-context.service';

export type StructuredLogLevel = Exclude<LogLevel, 'silent'>;
export type StructuredLogFields = Readonly<Record<string, unknown>>;

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY,
};

@Injectable()
export class StructuredLoggerService implements LoggerService {
  constructor(
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
    @Inject(RUNLANE_SERVICE_NAME) private readonly serviceName: RunlaneServiceName,
  ) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('info', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('fatal', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('trace', message, optionalParams);
  }

  logEvent(
    level: StructuredLogLevel,
    message: string,
    fields: StructuredLogFields = {},
    context?: string,
  ): void {
    if (!this.shouldWrite(level)) {
      return;
    }

    const requestContext = this.requestContext.current;
    const entry = sanitizeLogValue({
      ...fields,
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      runtimeProfile: this.config.runtimeProfile,
      ...(requestContext ?? {}),
      ...(context ? { context } : {}),
      message,
    });

    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(entry)}\n`);
  }

  private writeNestLog(
    level: StructuredLogLevel,
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    const { context, details } = normalizeOptionalParams(optionalParams);
    const fields: Record<string, unknown> = {};

    if (message instanceof Error) {
      fields.error = message;
    } else if (typeof message !== 'string') {
      fields.data = message;
    }

    if (details.length > 0) {
      fields.details = details;
    }

    this.logEvent(level, extractMessage(message), fields, context);
  }

  private shouldWrite(level: StructuredLogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.logLevel];
  }
}

function normalizeOptionalParams(optionalParams: readonly unknown[]): {
  readonly context?: string;
  readonly details: readonly unknown[];
} {
  const lastValue = optionalParams.at(-1);

  if (typeof lastValue !== 'string') {
    return { details: optionalParams };
  }

  return {
    context: lastValue,
    details: optionalParams.slice(0, -1),
  };
}

function extractMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }

  if (message instanceof Error) {
    return message.message;
  }

  if (isRecord(message)) {
    const nestedMessage = message.message;

    if (typeof nestedMessage === 'string') {
      return nestedMessage;
    }
  }

  return 'Log event';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
