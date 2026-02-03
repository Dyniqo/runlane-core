import { DomainError } from '@runlane/domain';

export function workflowNotFound(): DomainError {
  return new DomainError({
    code: 'WORKFLOW_NOT_FOUND',
    category: 'authorization',
    message: 'Workflow was not found for the current workspace',
  });
}

export function workflowUpdateEmpty(): DomainError {
  return new DomainError({
    code: 'WORKFLOW_UPDATE_EMPTY',
    category: 'validation',
    message: 'Workflow update must include at least one editable field',
  });
}
