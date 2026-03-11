import { DomainError } from '@runlane/domain';

export function invalidExecutionQuery(message: string): DomainError {
  return new DomainError({
    code: 'EXECUTION_QUERY_INVALID',
    category: 'validation',
    message,
  });
}
