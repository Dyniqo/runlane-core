import type { INestApplication, Type } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import type { RunlaneServiceName } from '@runlane/contracts';
import { NestFactory } from '@nestjs/core';
import { sanitizeLogValue } from './log-sanitizer';
import { StructuredLoggerService } from './structured-logger.service';

export interface RuntimeEndpoint {
  readonly host: string;
  readonly port: number;
}

export interface HttpRuntimeOptions {
  readonly module: Type<unknown>;
  readonly serviceName: RunlaneServiceName;
  readonly resolveEndpoint: (config: RuntimeConfigService) => RuntimeEndpoint;
  readonly configureApplication?: (
    application: INestApplication,
    config: RuntimeConfigService,
  ) => Promise<void> | void;
}

export async function bootstrapHttpRuntime(options: HttpRuntimeOptions): Promise<void> {
  let app: INestApplication | undefined;

  try {
    app = await NestFactory.create(options.module, { bufferLogs: true });
    const logger = app.get(StructuredLoggerService);
    const config = app.get(RuntimeConfigService);
    const endpoint = options.resolveEndpoint(config);

    app.useLogger(logger);
    await options.configureApplication?.(app, config);
    await app.listen(endpoint.port, endpoint.host);

    logger.logEvent(
      'info',
      'Runtime started',
      {
        host: endpoint.host,
        port: endpoint.port,
      },
      'RuntimeLifecycle',
    );

    installRuntimeLifecycle(app, logger, options.serviceName, config.shutdownTimeoutMs);
  } catch (error) {
    writeBootstrapFailure(options.serviceName, error);

    if (app) {
      try {
        await app.close();
      } catch (closeError) {
        writeBootstrapFailure(options.serviceName, closeError);
      }
    }

    process.exitCode = 1;
  }
}

function installRuntimeLifecycle(
  app: INestApplication,
  logger: StructuredLoggerService,
  serviceName: RunlaneServiceName,
  shutdownTimeoutMs: number,
): void {
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (reason: string, exitCode: number): Promise<void> => {
    shutdownPromise ??= closeApplication(
      app,
      logger,
      serviceName,
      reason,
      exitCode,
      shutdownTimeoutMs,
    );

    return shutdownPromise;
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });

  process.once('uncaughtException', (error) => {
    logger.logEvent('fatal', 'Uncaught exception', { error }, 'RuntimeLifecycle');
    void shutdown('uncaughtException', 1);
  });

  process.once('unhandledRejection', (reason) => {
    logger.logEvent('fatal', 'Unhandled rejection', { reason }, 'RuntimeLifecycle');
    void shutdown('unhandledRejection', 1);
  });
}

async function closeApplication(
  app: INestApplication,
  logger: StructuredLoggerService,
  serviceName: RunlaneServiceName,
  reason: string,
  exitCode: number,
  shutdownTimeoutMs: number,
): Promise<void> {
  logger.logEvent('info', 'Runtime shutdown initiated', { reason }, 'RuntimeLifecycle');

  const timeout = setTimeout(() => {
    logger.logEvent(
      'fatal',
      'Runtime shutdown timed out',
      {
        reason,
        shutdownTimeoutMs,
      },
      'RuntimeLifecycle',
    );
    process.exit(1);
  }, shutdownTimeoutMs);

  try {
    await app.close();
    logger.logEvent('info', 'Runtime shutdown completed', { reason }, 'RuntimeLifecycle');
    process.exitCode = exitCode;
  } catch (error) {
    logger.logEvent(
      'fatal',
      'Runtime shutdown failed',
      {
        error,
        reason,
        service: serviceName,
      },
      'RuntimeLifecycle',
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

function writeBootstrapFailure(serviceName: RunlaneServiceName, error: unknown): void {
  const entry = sanitizeLogValue({
    timestamp: new Date().toISOString(),
    level: 'fatal',
    service: serviceName,
    context: 'RuntimeLifecycle',
    message: 'Runtime bootstrap failed',
    error,
  });

  process.stderr.write(`${JSON.stringify(entry)}\n`);
}
