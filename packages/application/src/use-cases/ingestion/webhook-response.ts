import type { PublicWebhookResponseDto, WebhookRequestDto } from '@runlane/contracts';
import type { StoredWebhookRequestRecord, StoredWorkflowRecord } from '../../ports';

export function buildPublicWebhookResponse(
  request: StoredWebhookRequestRecord,
  workflow: StoredWorkflowRecord,
): PublicWebhookResponseDto {
  return {
    webhookRequest: mapWebhookRequest(request, workflow),
  };
}

function mapWebhookRequest(
  request: StoredWebhookRequestRecord,
  workflow: StoredWorkflowRecord,
): WebhookRequestDto {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    workflowId: request.workflowId,
    workflowPublicId: workflow.publicId,
    workflowVersion: workflow.version,
    status: request.status,
    source: request.source,
    idempotencyKey: request.idempotencyKey,
    payloadHash: request.payloadHash,
    receivedAt: request.createdAt.toISOString(),
  };
}
