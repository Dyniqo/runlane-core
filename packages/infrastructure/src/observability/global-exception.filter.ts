import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { isDomainError } from '@runlane/domain';
import { getDomainErrorHttpStatus } from '../errors';
import { RequestContextService } from './request-context.service';
import { StructuredLoggerService } from './structured-logger.service';

interface HttpRequestLike {
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

interface HttpResponseLike {
  readonly headersSent: boolean;
  status(statusCode: number): HttpResponseLike;
  json(body: unknown): void;
}

interface HttpExceptionResponse {
  readonly message?: string | readonly string[];
}

interface HttpStatusErrorLike {
  readonly message?: string;
  readonly status?: number;
  readonly statusCode?: number;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestLike>();
    const response = http.getResponse<HttpResponseLike>();
    const statusCode = getStatusCode(exception);
    const message = getPublicMessage(exception, statusCode);
    const errorCode = getPublicErrorCode(exception);
    const domainErrorContext = getDomainErrorLogContext(exception);
    const path = getRequestPath(request);
    const traceContext = this.requestContext.current;

    this.logger.logEvent(
      statusCode >= 500 ? 'error' : 'warn',
      'HTTP request failed',
      {
        error: exception,
        errorCode,
        ...domainErrorContext,
        method: request.method ?? 'UNKNOWN',
        path,
        statusCode,
        ...(traceContext ?? {}),
      },
      GlobalExceptionFilter.name,
    );

    if (response.headersSent) {
      return;
    }

    response.status(statusCode).json({
      statusCode,
      ...(errorCode ? { code: errorCode } : {}),
      message,
      timestamp: new Date().toISOString(),
      path,
      ...(traceContext ?? {}),
    });
  }
}

function getStatusCode(exception: unknown): number {
  if (isDomainError(exception)) {
    return getDomainErrorHttpStatus(exception);
  }

  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  if (isHttpStatusErrorLike(exception)) {
    return exception.statusCode ?? exception.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function getPublicMessage(exception: unknown, statusCode: number): string | readonly string[] {
  if (isDomainError(exception)) {
    return exception.message;
  }

  if (statusCode >= 500) {
    return 'Internal server error';
  }

  if (!(exception instanceof HttpException)) {
    return isHttpStatusErrorLike(exception) && exception.message
      ? exception.message
      : 'Request failed';
  }

  const exceptionResponse = exception.getResponse();

  if (typeof exceptionResponse === 'string') {
    return exceptionResponse;
  }

  if (isHttpExceptionResponse(exceptionResponse) && exceptionResponse.message) {
    return exceptionResponse.message;
  }

  return exception.message;
}

function getPublicErrorCode(exception: unknown): string | undefined {
  return isDomainError(exception) ? exception.code : undefined;
}

function getDomainErrorLogContext(exception: unknown): Record<string, unknown> {
  return isDomainError(exception)
    ? {
        domainErrorCategory: exception.category,
        domainErrorDetails: exception.details,
      }
    : {};
}

function isHttpExceptionResponse(value: unknown): value is HttpExceptionResponse {
  return typeof value === 'object' && value !== null;
}

function isHttpStatusErrorLike(value: unknown): value is HttpStatusErrorLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const statusCode = readHttpStatusCode(value);

  return (
    typeof statusCode === 'number' &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 599
  );
}

function readHttpStatusCode(value: object): number | undefined {
  const candidate = value as { readonly status?: unknown; readonly statusCode?: unknown };

  if (typeof candidate.statusCode === 'number') {
    return candidate.statusCode;
  }

  if (typeof candidate.status === 'number') {
    return candidate.status;
  }

  return undefined;
}

function getRequestPath(request: HttpRequestLike): string {
  return (request.originalUrl ?? request.url ?? '/').split('?', 1)[0] || '/';
}
