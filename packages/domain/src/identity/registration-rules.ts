import { DomainError } from '../shared';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 320;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;

export function normalizeUserEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.length === 0 || normalizedEmail.length > EMAIL_MAX_LENGTH) {
    throw invalidEmailAddress();
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw invalidEmailAddress();
  }

  return normalizedEmail;
}

export function normalizeUserName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/g, ' ');

  if (normalizedName.length < NAME_MIN_LENGTH || normalizedName.length > NAME_MAX_LENGTH) {
    throw new DomainError({
      code: 'USER_NAME_INVALID',
      category: 'validation',
      message: `User name must contain between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`,
    });
  }

  return normalizedName;
}

export function validateRegistrationPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new DomainError({
      code: 'USER_PASSWORD_INVALID',
      category: 'validation',
      message: `Password must contain between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
    });
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new DomainError({
      code: 'USER_PASSWORD_WEAK',
      category: 'validation',
      message: 'Password must include lowercase, uppercase and numeric characters',
    });
  }
}

export function createDefaultWorkspaceName(userName: string): string {
  return `${userName} Workspace`.slice(0, NAME_MAX_LENGTH);
}

function invalidEmailAddress(): DomainError {
  return new DomainError({
    code: 'USER_EMAIL_INVALID',
    category: 'validation',
    message: 'Email address is invalid',
  });
}
