export const DOMAIN_ERROR_CATEGORIES = [
  'validation',
  'authentication',
  'authorization',
  'not_found',
  'conflict',
  'business_rule',
  'rate_limit',
] as const;

export type DomainErrorCategory = (typeof DOMAIN_ERROR_CATEGORIES)[number];

export type DomainErrorDetails = Readonly<Record<string, unknown>>;

export interface DomainErrorOptions {
  readonly code: string;
  readonly message: string;
  readonly category: DomainErrorCategory;
  readonly details?: DomainErrorDetails;
  readonly cause?: unknown;
}

const DOMAIN_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const DOMAIN_ERROR_CATEGORY_SET = new Set<string>(DOMAIN_ERROR_CATEGORIES);

export class DomainError extends Error {
  readonly code: string;
  readonly category: DomainErrorCategory;
  readonly details: DomainErrorDetails;

  constructor(options: DomainErrorOptions) {
    assertDomainErrorCode(options.code);
    assertDomainErrorMessage(options.message);
    assertDomainErrorCategory(options.category);

    super(options.message, { cause: options.cause });

    this.name = new.target.name;
    this.code = options.code;
    this.category = options.category;
    this.details = Object.freeze({ ...(options.details ?? {}) });
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

function assertDomainErrorCode(code: string): void {
  if (!DOMAIN_ERROR_CODE_PATTERN.test(code)) {
    throw new TypeError('Domain error code must use upper snake case');
  }
}

function assertDomainErrorCategory(category: DomainErrorCategory): void {
  if (!DOMAIN_ERROR_CATEGORY_SET.has(category)) {
    throw new TypeError('Domain error category is not supported');
  }
}

function assertDomainErrorMessage(message: string): void {
  if (message.trim().length === 0) {
    throw new TypeError('Domain error message must not be empty');
  }
}
