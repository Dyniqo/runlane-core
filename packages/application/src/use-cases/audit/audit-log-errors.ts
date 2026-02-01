import { DomainError } from '@runlane/domain';

export function invalidAuditCursor(): DomainError {
  return new DomainError({
    code: 'AUDIT_CURSOR_INVALID',
    category: 'validation',
    message: 'Audit cursor is invalid',
  });
}
