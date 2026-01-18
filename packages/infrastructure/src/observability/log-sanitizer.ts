const REDACTED_KEY_PATTERN =
  /authorization|cookie|password|secret|token|api[-_]?key|credential|encryption[-_]?key|connection[-_]?string|database[-_]?url|redis[-_]?url|webhook[-_]?url/i;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^@\s/:]+):([^@\s]+)@/gi;
const AUTHORIZATION_VALUE_PATTERN = /\b(Bearer|Basic)\s+[^\s]+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(password|secret|token|api[-_]?key|authorization)=([^&\s]+)/gi;
const MAX_SERIALIZATION_DEPTH = 8;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 8192;

export function sanitizeLogValue(value: unknown): unknown {
  try {
    return sanitizeValue(value);
  } catch {
    return '[UNSERIALIZABLE]';
  }
}

function sanitizeValue(value: unknown, key = '', depth = 0, seen = new WeakSet<object>()): unknown {
  if (REDACTED_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }

  if (depth >= MAX_SERIALIZATION_DEPTH) {
    return '[MAX_DEPTH]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof URL) {
    return sanitizeString(value.toString());
  }

  if (value instanceof Error) {
    if (seen.has(value)) {
      return '[CIRCULAR]';
    }

    seen.add(value);
    return sanitizeError(value, depth, seen);
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key, depth + 1, seen));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }

  seen.add(value);

  const sanitizedEntries = Object.entries(value).map(([entryKey, entryValue]) => {
    return [entryKey, sanitizeValue(entryValue, entryKey, depth + 1, seen)] as const;
  });

  return Object.fromEntries(sanitizedEntries);
}

function sanitizeString(value: string): string {
  const sanitizedValue = value
    .replace(URL_CREDENTIAL_PATTERN, '$1$2:[REDACTED]@')
    .replace(AUTHORIZATION_VALUE_PATTERN, '$1 [REDACTED]')
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, '$1=[REDACTED]');

  return sanitizedValue.length <= MAX_STRING_LENGTH
    ? sanitizedValue
    : `${sanitizedValue.slice(0, MAX_STRING_LENGTH)}[TRUNCATED]`;
}

function sanitizeError(
  error: Error,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  return {
    name: error.name,
    message: sanitizeString(error.message),
    ...(error.stack ? { stack: sanitizeString(error.stack) } : {}),
    ...('cause' in error ? { cause: sanitizeValue(error.cause, 'cause', depth + 1, seen) } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
