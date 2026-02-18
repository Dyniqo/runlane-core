import type { PublicWebhookResponseDto } from '@runlane/contracts';
import {
  buildExecutionInputEnvelope,
  hashWebhookPayload,
  hashWebhookRuntimeKey,
  normalizeWebhookIdempotencyKey,
  normalizeWebhookSignature,
  normalizeWebhookSource,
  normalizeWorkflowPublicId,
  readWebhookPayload,
  verifyWebhookSignature,
  webhookIdempotencyConflict,
  webhookIdempotencyInProgress,
  webhookReplayDetected,
  webhookWorkflowNotAcceptingRequests,
  webhookWorkflowNotFound,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  ExecutionRepositoryPort,
  StoredExecutionRecord,
  StoredWebhookRequestRecord,
  StoredWorkflowRecord,
  TransactionBoundary,
  WebhookRequestRepositoryPort,
  WebhookRuntimeStatePort,
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

export interface ReceivePublicWebhookUseCaseOptions {
  readonly webhookSigningSecret: string;
  readonly signatureToleranceSeconds: number;
  readonly replayProtectionTtlSeconds: number;
  readonly idempotencyTtlSeconds: number;
}

export class ReceivePublicWebhookUseCase implements UseCase<
  ReceivePublicWebhookUseCaseInput,
  PublicWebhookResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly webhookRequests: WebhookRequestRepositoryPort,
    private readonly executions: ExecutionRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly runtimeState: WebhookRuntimeStatePort,
    private readonly transactionBoundary: TransactionBoundary,
    private readonly options: ReceivePublicWebhookUseCaseOptions,
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

      const verifiedSignature = verifyWebhookSignature({
        signature,
        payloadHash,
        signingSecret: this.options.webhookSigningSecret,
        now: new Date(),
        toleranceSeconds: this.options.signatureToleranceSeconds,
      });

      const replayReserved = await this.runtimeState.reserveReplay({
        workspaceId: workflow.workspaceId,
        replayKeyHash: verifiedSignature.replayKeyHash,
        ttlSeconds: this.options.replayProtectionTtlSeconds,
      });

      if (!replayReserved) {
        throw webhookReplayDetected();
      }

      if (idempotencyKey) {
        const existingWebhookRequest = await this.webhookRequests.findLatestByIdempotencyKey({
          workspaceId: workflow.workspaceId,
          workflowId: workflow.id,
          idempotencyKey,
        });

        if (existingWebhookRequest) {
          if (existingWebhookRequest.payloadHash !== payloadHash) {
            throw webhookIdempotencyConflict();
          }

          const existingExecution = await this.resolveOrCreateWebhookExecution({
            webhookRequest: existingWebhookRequest,
            workflow,
            payload,
          });

          return buildPublicWebhookResponse(existingWebhookRequest, workflow, existingExecution);
        }

        const idempotencyKeyHash = hashWebhookRuntimeKey(idempotencyKey);
        const idempotencyReserved = await this.runtimeState.reserveIdempotencyKey({
          workspaceId: workflow.workspaceId,
          idempotencyKeyHash,
          ttlSeconds: this.options.idempotencyTtlSeconds,
        });

        if (!idempotencyReserved) {
          const concurrentlyCreatedRequest = await this.webhookRequests.findLatestByIdempotencyKey({
            workspaceId: workflow.workspaceId,
            workflowId: workflow.id,
            idempotencyKey,
          });

          if (concurrentlyCreatedRequest?.payloadHash === payloadHash) {
            const concurrentlyCreatedExecution = await this.resolveOrCreateWebhookExecution({
              webhookRequest: concurrentlyCreatedRequest,
              workflow,
              payload,
            });

            return buildPublicWebhookResponse(
              concurrentlyCreatedRequest,
              workflow,
              concurrentlyCreatedExecution,
            );
          }

          throw webhookIdempotencyInProgress();
        }
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

      const execution = await this.createWebhookExecution({
        webhookRequest,
        workflow,
        payload,
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
          executionId: execution.id,
          source,
          idempotencyKey,
          payloadHash,
          signatureTimestampSeconds: verifiedSignature.timestampSeconds,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      await this.auditLogs.create({
        workspaceId: workflow.workspaceId,
        actorUserId: null,
        action: 'execution.created',
        entityType: 'execution',
        entityId: execution.id,
        metadata: {
          workflowId: workflow.id,
          workflowPublicId: workflow.publicId,
          workflowVersion: workflow.version,
          triggerType: 'webhook',
          sourceId: webhookRequest.id,
          source,
          idempotencyKey,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildPublicWebhookResponse(webhookRequest, workflow, execution);
    });
  }

  private async resolveOrCreateWebhookExecution(input: {
    readonly webhookRequest: StoredWebhookRequestRecord;
    readonly workflow: StoredWorkflowRecord;
    readonly payload: ReturnType<typeof readWebhookPayload>;
  }): Promise<StoredExecutionRecord> {
    const existingExecution = await this.executions.findLatestByTriggerSource({
      workspaceId: input.workflow.workspaceId,
      workflowId: input.workflow.id,
      triggerType: 'webhook',
      sourceId: input.webhookRequest.id,
    });

    return existingExecution ?? this.createWebhookExecution(input);
  }

  private createWebhookExecution(input: {
    readonly webhookRequest: StoredWebhookRequestRecord;
    readonly workflow: StoredWorkflowRecord;
    readonly payload: ReturnType<typeof readWebhookPayload>;
  }): Promise<StoredExecutionRecord> {
    return this.executions.createQueued({
      workspaceId: input.workflow.workspaceId,
      workflowId: input.workflow.id,
      input: buildExecutionInputEnvelope({
        triggerType: 'webhook',
        sourceId: input.webhookRequest.id,
        source: input.webhookRequest.source,
        idempotencyKey: input.webhookRequest.idempotencyKey,
        workflowPublicId: input.workflow.publicId,
        workflowVersion: input.workflow.version,
        acceptedAt: input.webhookRequest.createdAt,
        payload: input.payload,
        metadata: {
          payloadHash: input.webhookRequest.payloadHash,
        },
      }),
      queuedAt: input.webhookRequest.createdAt,
    });
  }
}
