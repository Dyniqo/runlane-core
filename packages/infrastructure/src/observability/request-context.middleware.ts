import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from './observability.tokens';
import { RequestContextService } from './request-context.service';
import { StructuredLoggerService } from './structured-logger.service';

interface HttpRequestLike {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

interface HttpResponseLike {
  readonly statusCode: number;
  readonly writableEnded: boolean;
  setHeader(name: string, value: string): void;
  once(event: 'finish' | 'close', listener: () => void): this;
}

const TRACE_VALUE_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_TRACE_VALUE_LENGTH = 128;

@Injectable()
export class RequestContextMiddleware {
  constructor(
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
  ) {}

  use(request: HttpRequestLike, response: HttpResponseLike, next: () => void): void {
    const requestId =
      normalizeTraceValue(readHeader(request.headers, REQUEST_ID_HEADER)) ?? randomUUID();
    const correlationId =
      normalizeTraceValue(readHeader(request.headers, CORRELATION_ID_HEADER)) ?? requestId;
    const method = request.method ?? 'UNKNOWN';
    const path = getRequestPath(request);
    const startedAt = process.hrtime.bigint();
    let completed = false;

    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    response.once('finish', () => {
      completed = true;
      const fields = {
        requestId,
        correlationId,
        method,
        path,
        statusCode: response.statusCode,
        durationMs: elapsedMilliseconds(startedAt),
      };

      if (response.statusCode >= 500) {
        this.logger.logEvent(
          'error',
          'HTTP request completed',
          fields,
          RequestContextMiddleware.name,
        );
        return;
      }

      if (response.statusCode >= 400) {
        this.logger.logEvent(
          'warn',
          'HTTP request completed',
          fields,
          RequestContextMiddleware.name,
        );
        return;
      }

      this.logger.logEvent('info', 'HTTP request completed', fields, RequestContextMiddleware.name);
    });

    response.once('close', () => {
      if (completed || response.writableEnded) {
        return;
      }

      this.logger.logEvent(
        'warn',
        'HTTP request connection closed before completion',
        {
          requestId,
          correlationId,
          method,
          path,
          durationMs: elapsedMilliseconds(startedAt),
        },
        RequestContextMiddleware.name,
      );
    });

    this.requestContext.run({ requestId, correlationId }, next);
  }
}

function readHeader(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];

  if (typeof value === 'string') {
    return value;
  }

  return value?.[0];
}

function normalizeTraceValue(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  if (
    !normalizedValue ||
    normalizedValue.length > MAX_TRACE_VALUE_LENGTH ||
    !TRACE_VALUE_PATTERN.test(normalizedValue)
  ) {
    return undefined;
  }

  return normalizedValue;
}

function getRequestPath(request: HttpRequestLike): string {
  return (request.originalUrl ?? request.url ?? '/').split('?', 1)[0] || '/';
}

function elapsedMilliseconds(startedAt: bigint): number {
  return Math.round((Number(process.hrtime.bigint() - startedAt) / 1_000_000) * 1000) / 1000;
}
