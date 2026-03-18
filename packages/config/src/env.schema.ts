import { isIP } from 'node:net';

export const RUNTIME_PROFILES = ['local', 'deploy'] as const;
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export type RuntimeProfile = (typeof RUNTIME_PROFILES)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface RuntimeEnvironment {
  readonly RUNTIME_PROFILE: RuntimeProfile;
  readonly API_HOST: string;
  readonly API_PORT: number;
  readonly WORKER_HOST: string;
  readonly WORKER_PORT: number;
  readonly WORKER_CONCURRENCY: number;
  readonly WORKER_HEARTBEAT_INTERVAL_MS: number;
  readonly WORKER_HEARTBEAT_TTL_SECONDS: number;
  readonly EXECUTION_RETRY_MAX_ATTEMPTS: number;
  readonly EXECUTION_RETRY_BASE_DELAY_MS: number;
  readonly EXECUTION_RETRY_MAX_DELAY_MS: number;
  readonly HTTP_CONNECTOR_TIMEOUT_MS: number;
  readonly HTTP_CONNECTOR_MAX_RESPONSE_BYTES: number;
  readonly HTTP_CONNECTOR_REDIRECT_LIMIT: number;
  readonly HTTP_CONNECTOR_DEMO_URL_ALLOWLIST: readonly string[];
  readonly API_URL: string;
  readonly APP_URL: string;
  readonly DATABASE_URL: string;
  readonly REDIS_URL: string;
  readonly JWT_ACCESS_SECRET: string;
  readonly JWT_REFRESH_SECRET: string;
  readonly ACCESS_TOKEN_TTL: number;
  readonly REFRESH_TOKEN_TTL: number;
  readonly CORS_ORIGIN: readonly string[];
  readonly RATE_LIMIT_TTL: number;
  readonly RATE_LIMIT_MAX: number;
  readonly MAX_PAYLOAD_SIZE: number;
  readonly ENCRYPTION_KEY: string;
  readonly WEBHOOK_SIGNING_SECRET: string;
  readonly WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: number;
  readonly WEBHOOK_REPLAY_TTL_SECONDS: number;
  readonly WEBHOOK_IDEMPOTENCY_TTL_SECONDS: number;
  readonly API_DOCS_ENABLED: boolean;
  readonly API_DOCS_PATH: string;
  readonly HEALTH_CHECK_TIMEOUT_MS: number;
  readonly REDIS_CONNECT_TIMEOUT_MS: number;
  readonly LOG_LEVEL: LogLevel;
  readonly SHUTDOWN_TIMEOUT_MS: number;
}

const LOCAL_DEFAULTS = {
  API_HOST: '0.0.0.0',
  API_PORT: 4600,
  WORKER_HOST: '0.0.0.0',
  WORKER_PORT: 4601,
  WORKER_CONCURRENCY: 4,
  WORKER_HEARTBEAT_INTERVAL_MS: 10000,
  WORKER_HEARTBEAT_TTL_SECONDS: 45,
  EXECUTION_RETRY_MAX_ATTEMPTS: 3,
  EXECUTION_RETRY_BASE_DELAY_MS: 500,
  EXECUTION_RETRY_MAX_DELAY_MS: 30000,
  HTTP_CONNECTOR_TIMEOUT_MS: 10000,
  HTTP_CONNECTOR_MAX_RESPONSE_BYTES: 1048576,
  HTTP_CONNECTOR_REDIRECT_LIMIT: 3,
  HTTP_CONNECTOR_DEMO_URL_ALLOWLIST:
    'https://postman-echo.com,https://httpbin.org,https://httpbingo.org,https://echo.free.beeceptor.com,https://example.com',
  API_URL: 'http://localhost:4600',
  APP_URL: 'http://localhost:4600',
  DATABASE_URL: 'postgresql://runlane:runlane_local_database@127.0.0.1:15432/runlane?schema=public',
  REDIS_URL: 'redis://127.0.0.1:16379/0',
  JWT_ACCESS_SECRET: 'runlane_local_access_secret_change_me_64_bytes_minimum_value',
  JWT_REFRESH_SECRET: 'runlane_local_refresh_secret_change_me_64_bytes_minimum_value',
  ENCRYPTION_KEY: 'runlane_local_encryption_key_change_me_64_bytes_minimum_value',
  ACCESS_TOKEN_TTL: 900,
  REFRESH_TOKEN_TTL: 2592000,
  CORS_ORIGIN: 'http://localhost:4600,http://127.0.0.1:4600',
  RATE_LIMIT_TTL: 60,
  RATE_LIMIT_MAX: 25,
  MAX_PAYLOAD_SIZE: 1048576,
  WEBHOOK_SIGNING_SECRET: 'runlane_local_webhook_signing_secret_change_me_64_bytes_minimum_value',
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: 300,
  WEBHOOK_REPLAY_TTL_SECONDS: 600,
  WEBHOOK_IDEMPOTENCY_TTL_SECONDS: 86400,
  API_DOCS_PATH: 'docs',
  HEALTH_CHECK_TIMEOUT_MS: 3000,
  REDIS_CONNECT_TIMEOUT_MS: 5000,
  LOG_LEVEL: 'info',
  SHUTDOWN_TIMEOUT_MS: 15000,
} as const;

export function validateEnvironment(source: NodeJS.ProcessEnv): RuntimeEnvironment {
  const errors: string[] = [];
  const runtimeProfile = readEnum(
    source.RUNTIME_PROFILE,
    'RUNTIME_PROFILE',
    RUNTIME_PROFILES,
    'local',
    errors,
  );
  const deployRequired = runtimeProfile === 'deploy';

  const environment: RuntimeEnvironment = {
    RUNTIME_PROFILE: runtimeProfile,
    API_HOST: readHost(source.API_HOST, 'API_HOST', LOCAL_DEFAULTS.API_HOST, errors),
    API_PORT: readPort(source.API_PORT, 'API_PORT', LOCAL_DEFAULTS.API_PORT, errors),
    WORKER_HOST: readHost(source.WORKER_HOST, 'WORKER_HOST', LOCAL_DEFAULTS.WORKER_HOST, errors),
    WORKER_PORT: readPort(source.WORKER_PORT, 'WORKER_PORT', LOCAL_DEFAULTS.WORKER_PORT, errors),
    WORKER_CONCURRENCY: readInteger(
      source.WORKER_CONCURRENCY,
      'WORKER_CONCURRENCY',
      LOCAL_DEFAULTS.WORKER_CONCURRENCY,
      1,
      100,
      errors,
    ),
    WORKER_HEARTBEAT_INTERVAL_MS: readInteger(
      source.WORKER_HEARTBEAT_INTERVAL_MS,
      'WORKER_HEARTBEAT_INTERVAL_MS',
      LOCAL_DEFAULTS.WORKER_HEARTBEAT_INTERVAL_MS,
      1000,
      60000,
      errors,
    ),
    WORKER_HEARTBEAT_TTL_SECONDS: readInteger(
      source.WORKER_HEARTBEAT_TTL_SECONDS,
      'WORKER_HEARTBEAT_TTL_SECONDS',
      LOCAL_DEFAULTS.WORKER_HEARTBEAT_TTL_SECONDS,
      5,
      300,
      errors,
    ),
    EXECUTION_RETRY_MAX_ATTEMPTS: readInteger(
      source.EXECUTION_RETRY_MAX_ATTEMPTS,
      'EXECUTION_RETRY_MAX_ATTEMPTS',
      LOCAL_DEFAULTS.EXECUTION_RETRY_MAX_ATTEMPTS,
      1,
      10,
      errors,
    ),
    EXECUTION_RETRY_BASE_DELAY_MS: readInteger(
      source.EXECUTION_RETRY_BASE_DELAY_MS,
      'EXECUTION_RETRY_BASE_DELAY_MS',
      LOCAL_DEFAULTS.EXECUTION_RETRY_BASE_DELAY_MS,
      0,
      60000,
      errors,
    ),
    EXECUTION_RETRY_MAX_DELAY_MS: readInteger(
      source.EXECUTION_RETRY_MAX_DELAY_MS,
      'EXECUTION_RETRY_MAX_DELAY_MS',
      LOCAL_DEFAULTS.EXECUTION_RETRY_MAX_DELAY_MS,
      0,
      300000,
      errors,
    ),
    HTTP_CONNECTOR_TIMEOUT_MS: readInteger(
      source.HTTP_CONNECTOR_TIMEOUT_MS,
      'HTTP_CONNECTOR_TIMEOUT_MS',
      LOCAL_DEFAULTS.HTTP_CONNECTOR_TIMEOUT_MS,
      250,
      30000,
      errors,
    ),
    HTTP_CONNECTOR_MAX_RESPONSE_BYTES: readInteger(
      source.HTTP_CONNECTOR_MAX_RESPONSE_BYTES,
      'HTTP_CONNECTOR_MAX_RESPONSE_BYTES',
      LOCAL_DEFAULTS.HTTP_CONNECTOR_MAX_RESPONSE_BYTES,
      1024,
      5242880,
      errors,
    ),
    HTTP_CONNECTOR_REDIRECT_LIMIT: readInteger(
      source.HTTP_CONNECTOR_REDIRECT_LIMIT,
      'HTTP_CONNECTOR_REDIRECT_LIMIT',
      LOCAL_DEFAULTS.HTTP_CONNECTOR_REDIRECT_LIMIT,
      0,
      10,
      errors,
    ),
    HTTP_CONNECTOR_DEMO_URL_ALLOWLIST: readOptionalUrlAllowlist(
      source.HTTP_CONNECTOR_DEMO_URL_ALLOWLIST,
      'HTTP_CONNECTOR_DEMO_URL_ALLOWLIST',
      deployRequired ? '' : LOCAL_DEFAULTS.HTTP_CONNECTOR_DEMO_URL_ALLOWLIST,
      errors,
    ),
    API_URL: readUrl(
      source.API_URL,
      'API_URL',
      deployRequired ? undefined : LOCAL_DEFAULTS.API_URL,
      ['http:', 'https:'],
      errors,
    ),
    APP_URL: readUrl(
      source.APP_URL,
      'APP_URL',
      deployRequired ? undefined : LOCAL_DEFAULTS.APP_URL,
      ['http:', 'https:'],
      errors,
    ),
    DATABASE_URL: readUrl(
      source.DATABASE_URL,
      'DATABASE_URL',
      deployRequired ? undefined : LOCAL_DEFAULTS.DATABASE_URL,
      ['postgres:', 'postgresql:'],
      errors,
    ),
    REDIS_URL: readUrl(
      source.REDIS_URL,
      'REDIS_URL',
      deployRequired ? undefined : LOCAL_DEFAULTS.REDIS_URL,
      ['redis:', 'rediss:'],
      errors,
    ),
    JWT_ACCESS_SECRET: readSecret(
      source.JWT_ACCESS_SECRET,
      'JWT_ACCESS_SECRET',
      deployRequired ? undefined : LOCAL_DEFAULTS.JWT_ACCESS_SECRET,
      errors,
    ),
    JWT_REFRESH_SECRET: readSecret(
      source.JWT_REFRESH_SECRET,
      'JWT_REFRESH_SECRET',
      deployRequired ? undefined : LOCAL_DEFAULTS.JWT_REFRESH_SECRET,
      errors,
    ),
    ACCESS_TOKEN_TTL: readInteger(
      source.ACCESS_TOKEN_TTL,
      'ACCESS_TOKEN_TTL',
      LOCAL_DEFAULTS.ACCESS_TOKEN_TTL,
      60,
      86400,
      errors,
    ),
    REFRESH_TOKEN_TTL: readInteger(
      source.REFRESH_TOKEN_TTL,
      'REFRESH_TOKEN_TTL',
      LOCAL_DEFAULTS.REFRESH_TOKEN_TTL,
      300,
      31536000,
      errors,
    ),
    CORS_ORIGIN: readCorsOrigins(
      source.CORS_ORIGIN,
      'CORS_ORIGIN',
      deployRequired ? undefined : LOCAL_DEFAULTS.CORS_ORIGIN,
      errors,
    ),
    RATE_LIMIT_TTL: readInteger(
      source.RATE_LIMIT_TTL,
      'RATE_LIMIT_TTL',
      LOCAL_DEFAULTS.RATE_LIMIT_TTL,
      1,
      3600,
      errors,
    ),
    RATE_LIMIT_MAX: readInteger(
      source.RATE_LIMIT_MAX,
      'RATE_LIMIT_MAX',
      LOCAL_DEFAULTS.RATE_LIMIT_MAX,
      1,
      10000,
      errors,
    ),
    MAX_PAYLOAD_SIZE: readInteger(
      source.MAX_PAYLOAD_SIZE,
      'MAX_PAYLOAD_SIZE',
      LOCAL_DEFAULTS.MAX_PAYLOAD_SIZE,
      1024,
      10485760,
      errors,
    ),
    ENCRYPTION_KEY: readSecret(
      source.ENCRYPTION_KEY,
      'ENCRYPTION_KEY',
      deployRequired ? undefined : LOCAL_DEFAULTS.ENCRYPTION_KEY,
      errors,
    ),
    WEBHOOK_SIGNING_SECRET: readSecret(
      source.WEBHOOK_SIGNING_SECRET,
      'WEBHOOK_SIGNING_SECRET',
      deployRequired ? undefined : LOCAL_DEFAULTS.WEBHOOK_SIGNING_SECRET,
      errors,
    ),
    WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: readInteger(
      source.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
      'WEBHOOK_SIGNATURE_TOLERANCE_SECONDS',
      LOCAL_DEFAULTS.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
      30,
      3600,
      errors,
    ),
    WEBHOOK_REPLAY_TTL_SECONDS: readInteger(
      source.WEBHOOK_REPLAY_TTL_SECONDS,
      'WEBHOOK_REPLAY_TTL_SECONDS',
      LOCAL_DEFAULTS.WEBHOOK_REPLAY_TTL_SECONDS,
      60,
      86400,
      errors,
    ),
    WEBHOOK_IDEMPOTENCY_TTL_SECONDS: readInteger(
      source.WEBHOOK_IDEMPOTENCY_TTL_SECONDS,
      'WEBHOOK_IDEMPOTENCY_TTL_SECONDS',
      LOCAL_DEFAULTS.WEBHOOK_IDEMPOTENCY_TTL_SECONDS,
      300,
      604800,
      errors,
    ),
    API_DOCS_ENABLED: readBoolean(
      source.API_DOCS_ENABLED,
      'API_DOCS_ENABLED',
      !deployRequired,
      errors,
    ),
    API_DOCS_PATH: readRoutePath(
      source.API_DOCS_PATH,
      'API_DOCS_PATH',
      LOCAL_DEFAULTS.API_DOCS_PATH,
      errors,
    ),
    HEALTH_CHECK_TIMEOUT_MS: readInteger(
      source.HEALTH_CHECK_TIMEOUT_MS,
      'HEALTH_CHECK_TIMEOUT_MS',
      LOCAL_DEFAULTS.HEALTH_CHECK_TIMEOUT_MS,
      250,
      30000,
      errors,
    ),
    REDIS_CONNECT_TIMEOUT_MS: readInteger(
      source.REDIS_CONNECT_TIMEOUT_MS,
      'REDIS_CONNECT_TIMEOUT_MS',
      LOCAL_DEFAULTS.REDIS_CONNECT_TIMEOUT_MS,
      250,
      60000,
      errors,
    ),
    LOG_LEVEL: readEnum(
      source.LOG_LEVEL,
      'LOG_LEVEL',
      LOG_LEVELS,
      LOCAL_DEFAULTS.LOG_LEVEL,
      errors,
    ),
    SHUTDOWN_TIMEOUT_MS: readInteger(
      source.SHUTDOWN_TIMEOUT_MS,
      'SHUTDOWN_TIMEOUT_MS',
      LOCAL_DEFAULTS.SHUTDOWN_TIMEOUT_MS,
      1000,
      120000,
      errors,
    ),
  };

  if (environment.JWT_ACCESS_SECRET === environment.JWT_REFRESH_SECRET) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values');
  }

  if (
    environment.WORKER_HEARTBEAT_TTL_SECONDS * 1000 <
    environment.WORKER_HEARTBEAT_INTERVAL_MS * 2
  ) {
    errors.push(
      'WORKER_HEARTBEAT_TTL_SECONDS converted to milliseconds must be at least twice WORKER_HEARTBEAT_INTERVAL_MS',
    );
  }

  if (environment.HTTP_CONNECTOR_MAX_RESPONSE_BYTES > environment.MAX_PAYLOAD_SIZE * 5) {
    errors.push('HTTP_CONNECTOR_MAX_RESPONSE_BYTES must not exceed five times MAX_PAYLOAD_SIZE');
  }

  if (environment.EXECUTION_RETRY_MAX_DELAY_MS < environment.EXECUTION_RETRY_BASE_DELAY_MS) {
    errors.push(
      'EXECUTION_RETRY_MAX_DELAY_MS must be greater than or equal to EXECUTION_RETRY_BASE_DELAY_MS',
    );
  }

  if (environment.WEBHOOK_REPLAY_TTL_SECONDS < environment.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS) {
    errors.push(
      'WEBHOOK_REPLAY_TTL_SECONDS must be greater than or equal to WEBHOOK_SIGNATURE_TOLERANCE_SECONDS',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return Object.freeze(environment);
}

function readEnum<const T extends readonly string[]>(
  value: string | undefined,
  name: string,
  allowedValues: T,
  defaultValue: T[number],
  errors: string[],
): T[number] {
  const normalizedValue = value?.trim() || defaultValue;

  if (!allowedValues.some((allowedValue) => allowedValue === normalizedValue)) {
    errors.push(`${name} must be one of: ${allowedValues.join(', ')}`);
    return defaultValue;
  }

  return normalizedValue as T[number];
}

function readBoolean(
  value: string | undefined,
  name: string,
  defaultValue: boolean,
  errors: string[],
): boolean {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return defaultValue;
  }

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  errors.push(`${name} must be true or false`);
  return defaultValue;
}

function readCorsOrigins(
  value: string | undefined,
  name: string,
  defaultValue: string | undefined,
  errors: string[],
): readonly string[] {
  const normalizedValue = value?.trim() || defaultValue;

  if (!normalizedValue) {
    errors.push(`${name} is required`);
    return [];
  }

  const origins = normalizedValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    errors.push(`${name} must include at least one origin`);
    return [];
  }

  const uniqueOrigins = Array.from(new Set(origins));

  for (const origin of uniqueOrigins) {
    try {
      const parsedOrigin = new URL(origin);

      if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
        errors.push(`${name} entries must use http or https`);
      }

      if (parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
        errors.push(`${name} entries must contain origins without paths, queries or fragments`);
      }
    } catch {
      errors.push(`${name} entries must be valid origins`);
    }
  }

  return Object.freeze(uniqueOrigins);
}

function readRoutePath(
  value: string | undefined,
  name: string,
  defaultValue: string,
  errors: string[],
): string {
  const normalizedValue = value?.trim().replace(/^\/+|\/+$/g, '') || defaultValue;

  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(normalizedValue)) {
    errors.push(`${name} must contain lowercase route segments separated by / or -`);
    return defaultValue;
  }

  return normalizedValue;
}

function readHost(
  value: string | undefined,
  name: string,
  defaultValue: string,
  errors: string[],
): string {
  const normalizedValue = value?.trim() || defaultValue;

  if (
    isIP(normalizedValue) === 0 &&
    normalizedValue !== 'localhost' &&
    !isHostname(normalizedValue)
  ) {
    errors.push(`${name} must be a valid IP address or hostname`);
    return defaultValue;
  }

  return normalizedValue;
}

function isHostname(value: string): boolean {
  if (value.length > 253) {
    return false;
  }

  return value.split('.').every((label) => {
    return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label);
  });
}

function readPort(
  value: string | undefined,
  name: string,
  defaultValue: number,
  errors: string[],
): number {
  return readInteger(value, name, defaultValue, 1, 65535, errors);
}

function readInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
  errors: string[],
): number {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return defaultValue;
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < minimum || parsedValue > maximum) {
    errors.push(`${name} must be an integer between ${minimum} and ${maximum}`);
    return defaultValue;
  }

  return parsedValue;
}

function readOptionalUrlAllowlist(
  value: string | undefined,
  name: string,
  defaultValue: string,
  errors: string[],
): readonly string[] {
  const normalizedValue = value?.trim() ?? defaultValue;

  if (!normalizedValue) {
    return Object.freeze([]);
  }

  const entries = normalizedValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const uniqueEntries = Array.from(new Set(entries));

  for (const entry of uniqueEntries) {
    try {
      const parsedEntry = new URL(entry);

      if (!['http:', 'https:'].includes(parsedEntry.protocol)) {
        errors.push(`${name} entries must use http or https`);
      }

      if (!parsedEntry.hostname) {
        errors.push(`${name} entries must include a hostname`);
      }
    } catch {
      if (!isHostname(entry)) {
        errors.push(`${name} entries must be valid URLs or hostnames`);
      }
    }
  }

  return Object.freeze(uniqueEntries);
}

function readUrl(
  value: string | undefined,
  name: string,
  defaultValue: string | undefined,
  allowedProtocols: readonly string[],
  errors: string[],
): string {
  const normalizedValue = value?.trim() || defaultValue;

  if (!normalizedValue) {
    errors.push(`${name} is required`);
    return '';
  }

  try {
    const parsedValue = new URL(normalizedValue);

    if (!allowedProtocols.includes(parsedValue.protocol)) {
      errors.push(`${name} must use one of these protocols: ${allowedProtocols.join(', ')}`);
    }

    if (!parsedValue.hostname) {
      errors.push(`${name} must include a hostname`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }

  return normalizedValue;
}

function readSecret(
  value: string | undefined,
  name: string,
  defaultValue: string | undefined,
  errors: string[],
): string {
  const normalizedValue = value?.trim() || defaultValue;

  if (!normalizedValue) {
    errors.push(`${name} is required`);
    return '';
  }

  if (normalizedValue.length < 48) {
    errors.push(`${name} must contain at least 48 characters`);
  }

  return normalizedValue;
}
