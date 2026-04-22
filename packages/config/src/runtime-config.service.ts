import { Inject, Injectable } from '@nestjs/common';
import type { AiProviderName, LogLevel, RuntimeEnvironment, RuntimeProfile } from './env.schema';
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

  get workerConcurrency(): number {
    return this.environment.WORKER_CONCURRENCY;
  }

  get workerHeartbeatIntervalMs(): number {
    return this.environment.WORKER_HEARTBEAT_INTERVAL_MS;
  }

  get workerHeartbeatTtlSeconds(): number {
    return this.environment.WORKER_HEARTBEAT_TTL_SECONDS;
  }

  get executionRetryMaxAttempts(): number {
    return this.environment.EXECUTION_RETRY_MAX_ATTEMPTS;
  }

  get executionRetryBaseDelayMs(): number {
    return this.environment.EXECUTION_RETRY_BASE_DELAY_MS;
  }

  get executionRetryMaxDelayMs(): number {
    return this.environment.EXECUTION_RETRY_MAX_DELAY_MS;
  }

  get httpConnectorTimeoutMs(): number {
    return this.environment.HTTP_CONNECTOR_TIMEOUT_MS;
  }

  get httpConnectorMaxResponseBytes(): number {
    return this.environment.HTTP_CONNECTOR_MAX_RESPONSE_BYTES;
  }

  get httpConnectorRedirectLimit(): number {
    return this.environment.HTTP_CONNECTOR_REDIRECT_LIMIT;
  }

  get httpConnectorDemoUrlAllowlist(): readonly string[] {
    return this.environment.HTTP_CONNECTOR_DEMO_URL_ALLOWLIST;
  }

  get aiProvider(): AiProviderName {
    return this.environment.AI_PROVIDER;
  }

  get aiApiKey(): string | null {
    return this.environment.AI_API_KEY;
  }

  get aiBaseUrl(): string {
    return this.environment.AI_BASE_URL;
  }

  get aiModel(): string {
    return this.environment.AI_MODEL;
  }

  get aiTimeoutMs(): number {
    return this.environment.AI_TIMEOUT_MS;
  }

  get slackWebhookUrl(): string | null {
    return this.environment.SLACK_WEBHOOK_URL;
  }

  get discordWebhookUrl(): string | null {
    return this.environment.DISCORD_WEBHOOK_URL;
  }

  get notificationConnectorTimeoutMs(): number {
    return this.environment.NOTIFICATION_CONNECTOR_TIMEOUT_MS;
  }

  get notificationConnectorMaxPayloadBytes(): number {
    return this.environment.NOTIFICATION_CONNECTOR_MAX_PAYLOAD_BYTES;
  }

  get notificationFailureAlertsEnabled(): boolean {
    return this.environment.NOTIFICATION_FAILURE_ALERTS_ENABLED;
  }

  get stripeWebhookSecret(): string | null {
    return this.environment.STRIPE_WEBHOOK_SECRET;
  }

  get stripeWebhookToleranceSeconds(): number {
    return this.environment.STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  }

  get stripeApiKey(): string | null {
    return this.environment.STRIPE_API_KEY;
  }

  get stripeApiBaseUrl(): string {
    return this.environment.STRIPE_API_BASE_URL;
  }

  get stripeRequestTimeoutMs(): number {
    return this.environment.STRIPE_REQUEST_TIMEOUT_MS;
  }

  get stripePriceStarterId(): string | null {
    return this.environment.STRIPE_PRICE_STARTER_ID;
  }

  get stripePriceProId(): string | null {
    return this.environment.STRIPE_PRICE_PRO_ID;
  }

  get stripePriceAgencyId(): string | null {
    return this.environment.STRIPE_PRICE_AGENCY_ID;
  }

  get stripeCheckoutSuccessUrl(): string {
    return this.environment.STRIPE_CHECKOUT_SUCCESS_URL;
  }

  get stripeCheckoutCancelUrl(): string {
    return this.environment.STRIPE_CHECKOUT_CANCEL_URL;
  }

  get stripePortalReturnUrl(): string {
    return this.environment.STRIPE_PORTAL_RETURN_URL;
  }

  get demoModeEnabled(): boolean {
    return this.environment.DEMO_MODE;
  }

  get demoUserEmail(): string {
    return this.environment.DEMO_USER_EMAIL;
  }

  get demoUserPassword(): string {
    return this.environment.DEMO_USER_PASSWORD;
  }

  get demoUserName(): string {
    return this.environment.DEMO_USER_NAME;
  }

  get demoWorkspaceName(): string {
    return this.environment.DEMO_WORKSPACE_NAME;
  }

  get demoApiKey(): string {
    return this.environment.DEMO_API_KEY;
  }

  get demoExecutionLimitPerHour(): number {
    return this.environment.DEMO_EXECUTION_LIMIT_PER_HOUR;
  }

  get demoAiCallLimitPerDay(): number {
    return this.environment.DEMO_AI_CALL_LIMIT_PER_DAY;
  }

  get publicRegistrationEnabled(): boolean {
    return this.environment.PUBLIC_REGISTRATION_ENABLED;
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

  get encryptionKey(): string {
    return this.environment.ENCRYPTION_KEY;
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
