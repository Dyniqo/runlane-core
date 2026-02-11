import type { PublicWebhookResponseDto } from '@runlane/contracts';
import {
  hashWebhookPayload,
  normalizeWebhookIdempotencyKey,
  normalizeWebhookSignature,
  normalizeWebhookSource,
  normalizeWorkflowPublicId,
  readWebhookPayload,
  webhookWorkflowNotAcceptingRequests,
  webhookWorkflowNotFound,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WebhookRequestRepositoryPort,
  WorkflowRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildPublicWebhookResponse } from './webhook-response';

export interface ReceivePublicWebhookUseCaseInput {
  readonly workflowPublicId: string;
  readonly payload: unknown;
  readonly signature: string | null;
  readonly idempotencyKey: string | null;
  readonly source: string | null;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class ReceivePublicWebhookUseCase implements UseCase<
  ReceivePublicWebhookUseCaseInput,
  PublicWebhookResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly webhookRequests: WebhookRequestRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: ReceivePublicWebhookUseCaseInput): Promise<PublicWebhookResponseDto> {
    const publicId = normalizeWorkflowPublicId(input.workflowPublicId);
    const payload = readWebhookPayload(input.payload);
    const source = normalizeWebhookSource(input.source);
    const signature = normalizeWebhookSignature(input.signature);
    const idempotencyKey = normalizeWebhookIdempotencyKey(input.idempotencyKey);
    const payloadHash = hashWebhookPayload(payload);

    return this.transactionBoundary.execute(async () => {
      const workflow = await this.workflows.findPublishedByPublicId(publicId);

      if (!workflow) {
        throw webhookWorkflowNotFound();
      }

      if (workflow.triggerType !== 'webhook') {
        throw webhookWorkflowNotAcceptingRequests();
      }

      const webhookRequest = await this.webhookRequests.create({
        workspaceId: workflow.workspaceId,
        workflowId: workflow.id,
        signature,
        idempotencyKey,
        payloadHash,
        source,
        ip: input.ip,
        userAgent: input.userAgent,
        status: 'accepted',
      });

      await this.auditLogs.create({
        workspaceId: workflow.workspaceId,
        actorUserId: null,
        action: 'ingestion.webhook_received',
        entityType: 'webhook_request',
        entityId: webhookRequest.id,
        metadata: {
          workflowId: workflow.id,
          workflowPublicId: workflow.publicId,
          workflowVersion: workflow.version,
          source,
          idempotencyKey,
          payloadHash,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildPublicWebhookResponse(webhookRequest, workflow);
    });
  }
}
