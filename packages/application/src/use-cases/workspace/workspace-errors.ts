import { DomainError } from '@runlane/domain';

export function missingWorkspaceMembership(): DomainError {
  return new DomainError({
    code: 'WORKSPACE_MEMBERSHIP_MISSING',
    category: 'authorization',
    message: 'Workspace membership is required',
  });
}
