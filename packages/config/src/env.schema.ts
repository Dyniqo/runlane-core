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
  readonly API_URL: string;
  readonly APP_URL: string;
  readonly DATABASE_URL: string;
  readonly REDIS_URL: string;
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
  API_URL: 'http://localhost:4600',
  APP_URL: 'http://localhost:4600',
  DATABASE_URL: 'postgresql://runlane:runlane_local_database@127.0.0.1:15432/runlane?schema=public',
  REDIS_URL: 'redis://127.0.0.1:16379/0',
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
    API_DOCS_ENABLED: readBoolean(source.API_DOCS_ENABLED, !deployRequired, errors),
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

function readBoolean(value: string | undefined, defaultValue: boolean, errors: string[]): boolean {
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

  errors.push('API_DOCS_ENABLED must be true or false');
  return defaultValue;
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
