import { Inject, Injectable } from '@nestjs/common';
import type { LogLevel, RuntimeEnvironment, RuntimeProfile } from './env.schema';
import { RUNTIME_ENVIRONMENT } from './runtime-environment.provider';

@Injectable()
export class RuntimeConfigService {
  constructor(@Inject(RUNTIME_ENVIRONMENT) private readonly environment: RuntimeEnvironment) {}

  get runtimeProfile(): RuntimeProfile {
    return this.environment.RUNTIME_PROFILE;
  }

  get apiHost(): string {
    return this.environment.API_HOST;
  }

  get apiPort(): number {
    return this.environment.API_PORT;
  }

  get workerHost(): string {
    return this.environment.WORKER_HOST;
  }

  get workerPort(): number {
    return this.environment.WORKER_PORT;
  }

  get apiUrl(): string {
    return this.environment.API_URL;
  }

  get appUrl(): string {
    return this.environment.APP_URL;
  }

  get databaseUrl(): string {
    return this.environment.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.environment.REDIS_URL;
  }

  get logLevel(): LogLevel {
    return this.environment.LOG_LEVEL;
  }

  get shutdownTimeoutMs(): number {
    return this.environment.SHUTDOWN_TIMEOUT_MS;
  }
}
