import { DomainError } from '../shared';

export const DEMO_SEED_VERSION = 'demo-seed-v1';
export const DEMO_WORKFLOW_PUBLIC_IDS = {
  leadRouting: 'wf_00000000000000000000000000000040',
  automationBridge: 'wf_00000000000000000000000000000041',
} as const;

const DEMO_USER_EMAIL_MAX_LENGTH = 320;
const DEMO_USER_PASSWORD_MIN_LENGTH = 12;
const DEMO_USER_PASSWORD_MAX_LENGTH = 200;
const DEMO_USER_NAME_MAX_LENGTH = 120;
const DEMO_WORKSPACE_NAME_MAX_LENGTH = 120;
const DEMO_API_KEY_PATTERN = /^(rln_[A-Za-z0-9_-]{11})_[A-Za-z0-9_-]{43}$/;

export function assertDemoModeEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new DomainError({
      code: 'DEMO_MODE_DISABLED',
      category: 'authorization',
      message: 'Demo mode is disabled',
    });
  }
}

export function normalizeDemoUserEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > DEMO_USER_EMAIL_MAX_LENGTH ||
    !normalizedEmail.includes('@')
  ) {
    throw new DomainError({
      code: 'DEMO_USER_EMAIL_INVALID',
      category: 'validation',
      message: 'Demo user email is invalid',
    });
  }

  return normalizedEmail;
}

export function readDemoUserPassword(password: string): string {
  if (
    password.length < DEMO_USER_PASSWORD_MIN_LENGTH ||
    password.length > DEMO_USER_PASSWORD_MAX_LENGTH
  ) {
    throw new DomainError({
      code: 'DEMO_USER_PASSWORD_INVALID',
      category: 'validation',
      message: 'Demo user password is invalid',
    });
  }

  return password;
}

export function normalizeDemoUserName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, ' ');

  if (normalizedName.length === 0 || normalizedName.length > DEMO_USER_NAME_MAX_LENGTH) {
    throw new DomainError({
      code: 'DEMO_USER_NAME_INVALID',
      category: 'validation',
      message: 'Demo user name is invalid',
    });
  }

  return normalizedName;
}

export function normalizeDemoWorkspaceName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, ' ');

  if (normalizedName.length === 0 || normalizedName.length > DEMO_WORKSPACE_NAME_MAX_LENGTH) {
    throw new DomainError({
      code: 'DEMO_WORKSPACE_NAME_INVALID',
      category: 'validation',
      message: 'Demo workspace name is invalid',
    });
  }

  return normalizedName;
}

export function readDemoApiKey(value: string): { readonly token: string; readonly prefix: string } {
  const token = value.trim();
  const match = DEMO_API_KEY_PATTERN.exec(token);

  if (!match?.[1]) {
    throw new DomainError({
      code: 'DEMO_API_KEY_INVALID',
      category: 'validation',
      message: 'Demo API key is invalid',
    });
  }

  return { token, prefix: match[1] };
}

export function demoWorkspaceRequired(): DomainError {
  return new DomainError({
    code: 'DEMO_WORKSPACE_REQUIRED',
    category: 'authorization',
    message: 'Demo workspace access is required',
  });
}

export function demoLimitExceeded(input: {
  readonly resource: 'execution' | 'ai_call';
  readonly limit: number;
  readonly used: number;
  readonly window: 'hour' | 'day';
}): DomainError {
  return new DomainError({
    code: 'DEMO_LIMIT_EXCEEDED',
    category: 'rate_limit',
    message: 'Demo usage limit exceeded',
    details: input,
  });
}

export function publicRegistrationDisabled(): DomainError {
  return new DomainError({
    code: 'PUBLIC_REGISTRATION_DISABLED',
    category: 'authorization',
    message: 'Public registration is disabled',
  });
}
