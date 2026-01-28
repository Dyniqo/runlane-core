import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { RuntimeConfigService } from '@runlane/config';
import helmet from 'helmet';

export function configureHttpSecurity(
  application: INestApplication,
  config: RuntimeConfigService,
): void {
  application.use(
    helmet(
      config.apiDocsEnabled
        ? {
            contentSecurityPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' },
          }
        : {
            crossOriginResourcePolicy: { policy: 'cross-origin' },
          },
    ),
  );

  application.enableCors({
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'X-Correlation-Id',
      'X-Request-Id',
      'X-Runlane-Api-Key',
    ],
    credentials: true,
    maxAge: 600,
    methods: ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, !origin || config.corsAllowedOrigins.includes(origin));
    },
    exposedHeaders: [
      'Retry-After',
      'X-Correlation-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-Id',
    ],
  });

  const expressApplication = application as NestExpressApplication;

  expressApplication.useBodyParser('json', { limit: config.maxPayloadSizeBytes });
  expressApplication.useBodyParser('urlencoded', {
    extended: false,
    limit: config.maxPayloadSizeBytes,
  });

  application.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      stopAtFirstError: false,
      transform: false,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );
}
