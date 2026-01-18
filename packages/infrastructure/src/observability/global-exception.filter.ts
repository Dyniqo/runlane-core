import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
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
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = getPublicMessage(exception, statusCode);
    const path = getRequestPath(request);
    const traceContext = this.requestContext.current;

    this.logger.logEvent(
      statusCode >= 500 ? 'error' : 'warn',
      'HTTP request failed',
      {
        error: exception,
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
      message,
      timestamp: new Date().toISOString(),
      path,
      ...(traceContext ?? {}),
    });
  }
}

function getPublicMessage(exception: unknown, statusCode: number): string | readonly string[] {
  if (statusCode >= 500 || !(exception instanceof HttpException)) {
    return 'Internal server error';
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

function isHttpExceptionResponse(value: unknown): value is HttpExceptionResponse {
  return typeof value === 'object' && value !== null;
}

function getRequestPath(request: HttpRequestLike): string {
  return (request.originalUrl ?? request.url ?? '/').split('?', 1)[0] || '/';
}
