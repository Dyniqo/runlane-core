import {
  Global,
  Module,
  RequestMethod,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import type { RunlaneServiceName } from '@runlane/contracts';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './global-exception.filter';
import { RUNLANE_SERVICE_NAME } from './observability.tokens';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';
import { StructuredLoggerService } from './structured-logger.service';

export interface ObservabilityModuleOptions {
  readonly serviceName: RunlaneServiceName;
}

@Global()
@Module({})
export class RunlaneObservabilityModule implements NestModule {
  static forRoot(options: ObservabilityModuleOptions): DynamicModule {
    return {
      module: RunlaneObservabilityModule,
      imports: [RunlaneConfigModule],
      providers: [
        {
          provide: RUNLANE_SERVICE_NAME,
          useValue: options.serviceName,
        },
        RequestContextService,
        StructuredLoggerService,
        RequestContextMiddleware,
        {
          provide: APP_FILTER,
          useClass: GlobalExceptionFilter,
        },
      ],
      exports: [RequestContextService, StructuredLoggerService],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
