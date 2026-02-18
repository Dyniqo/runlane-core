import type { PublicWebhookResponseDto, WebhookRequestDto } from '@runlane/contracts';
import type {
  StoredExecutionRecord,
  StoredWebhookRequestRecord,
  StoredWorkflowRecord,
} from '../../ports';
import { buildExecutionResponse } from '../execution';

export function buildPublicWebhookResponse(
  request: StoredWebhookRequestRecord,
  workflow: StoredWorkflowRecord,
  execution: StoredExecutionRecord,
): PublicWebhookResponseDto {
  return {
    webhookRequest: mapWebhookRequest(request, workflow),
    execution: buildExecutionResponse(execution, workflow),
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
