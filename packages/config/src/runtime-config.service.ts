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

  get jwtAccessSecret(): string {
    return this.environment.JWT_ACCESS_SECRET;
  }

  get jwtRefreshSecret(): string {
    return this.environment.JWT_REFRESH_SECRET;
  }

  get accessTokenTtlSeconds(): number {
    return this.environment.ACCESS_TOKEN_TTL;
  }

  get refreshTokenTtlSeconds(): number {
    return this.environment.REFRESH_TOKEN_TTL;
  }

  get corsAllowedOrigins(): readonly string[] {
    return this.environment.CORS_ORIGIN;
  }

  get rateLimitTtlSeconds(): number {
    return this.environment.RATE_LIMIT_TTL;
  }

  get rateLimitMaxRequests(): number {
    return this.environment.RATE_LIMIT_MAX;
  }

  get maxPayloadSizeBytes(): number {
    return this.environment.MAX_PAYLOAD_SIZE;
  }

  get webhookSigningSecret(): string {
    return this.environment.WEBHOOK_SIGNING_SECRET;
  }

  get webhookSignatureToleranceSeconds(): number {
    return this.environment.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  }

  get webhookReplayTtlSeconds(): number {
    return this.environment.WEBHOOK_REPLAY_TTL_SECONDS;
  }

  get webhookIdempotencyTtlSeconds(): number {
    return this.environment.WEBHOOK_IDEMPOTENCY_TTL_SECONDS;
  }

  get apiDocsEnabled(): boolean {
    return this.environment.API_DOCS_ENABLED;
  }

  get apiDocsPath(): string {
    return this.environment.API_DOCS_PATH;
  }

  get healthCheckTimeoutMs(): number {
    return this.environment.HEALTH_CHECK_TIMEOUT_MS;
  }

  get redisConnectTimeoutMs(): number {
    return this.environment.REDIS_CONNECT_TIMEOUT_MS;
  }

  get logLevel(): LogLevel {
    return this.environment.LOG_LEVEL;
  }

  get shutdownTimeoutMs(): number {
    return this.environment.SHUTDOWN_TIMEOUT_MS;
  }
}
