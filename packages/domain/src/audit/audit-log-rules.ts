export const AUDIT_ACTIONS = [
  'identity.user_registered',
  'identity.user_logged_in',
  'identity.session_refreshed',
  'identity.session_logged_out',
  'workspace.updated',
  'access.api_key_created',
  'access.api_key_revoked',
  'workflow.created',
  'workflow.updated',
  'workflow.published',
  'workflow.test_contract.created',
  'ingestion.webhook_received',
  'automation.bridge_request_received',
  'execution.created',
  'execution.enqueued',
  'execution.started',
  'execution.retrying',
  'execution.succeeded',
  'execution.failed',
] as const;

export const AUDIT_ENTITY_TYPES = [
  'user',
  'session',
  'workspace',
  'api_key',
  'workflow',
  'webhook_request',
  'execution',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
