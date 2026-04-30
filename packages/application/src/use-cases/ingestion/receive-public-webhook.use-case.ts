import { randomUUID } from 'node:crypto';
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
  ExecutionQueuePort,
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
import type { PlanLimitEnforcer, UsageRecorder } from '../usage';
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

interface CreatedExecutionQueueContext {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly isDemo: boolean;
  readonly demoSessionId: string | null;
  readonly executionId: string;
  readonly webhookRequestId: string;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

interface ReceivePublicWebhookResult {
  readonly response: PublicWebhookResponseDto;
  readonly queueContext: CreatedExecutionQueueContext | null;
}

interface ResolvedWebhookExecution {
  readonly execution: StoredExecutionRecord;
  readonly created: boolean;
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
    private readonly executionQueue: ExecutionQueuePort,
    private readonly transactionBoundary: TransactionBoundary,
    private readonly usage: UsageRecorder,
    private readonly planLimits: PlanLimitEnforcer,
    private readonly options: ReceivePublicWebhookUseCaseOptions,
  ) {}

  async execute(input: ReceivePublicWebhookUseCaseInput): Promise<PublicWebhookResponseDto> {
    const publicId = normalizeWorkflowPublicId(input.workflowPublicId);
    const payload = readWebhookPayload(input.payload);
    const source = normalizeWebhookSource(input.source);
    const signature = normalizeWebhookSignature(input.signature);
    const idempotencyKey = normalizeWebhookIdempotencyKey(input.idempotencyKey);
    const payloadHash = hashWebhookPayload(payload);

    const result = await this.transactionBoundary.execute(
      async (): Promise<ReceivePublicWebhookResult> => {
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

        await this.planLimits.enforceWebhookRequest({ workspaceId: workflow.workspaceId });
        await this.planLimits.enforceExecutionCreation({ workspaceId: workflow.workspaceId });

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

            const resolvedExecution = await this.resolveOrCreateWebhookExecution({
              webhookRequest: existingWebhookRequest,
              workflow,
              payload,
            });

            return {
              response: buildPublicWebhookResponse(
                existingWebhookRequest,
                workflow,
                resolvedExecution.execution,
              ),
              queueContext: resolvedExecution.created
                ? this.buildWebhookQueueContext({
                    workflow,
                    webhookRequest: existingWebhookRequest,
                    execution: resolvedExecution.execution,
                    source,
                    idempotencyKey,
                    ip: input.ip,
                    userAgent: input.userAgent,
                  })
                : null,
            };
          }

          const idempotencyKeyHash = hashWebhookRuntimeKey(idempotencyKey);
          const idempotencyReserved = await this.runtimeState.reserveIdempotencyKey({
            workspaceId: workflow.workspaceId,
            idempotencyKeyHash,
            ttlSeconds: this.options.idempotencyTtlSeconds,
          });

          if (!idempotencyReserved) {
            const concurrentlyCreatedRequest =
              await this.webhookRequests.findLatestByIdempotencyKey({
                workspaceId: workflow.workspaceId,
                workflowId: workflow.id,
                idempotencyKey,
              });

            if (concurrentlyCreatedRequest?.payloadHash === payloadHash) {
              const resolvedExecution = await this.resolveOrCreateWebhookExecution({
                webhookRequest: concurrentlyCreatedRequest,
                workflow,
                payload,
              });

              return {
                response: buildPublicWebhookResponse(
                  concurrentlyCreatedRequest,
                  workflow,
                  resolvedExecution.execution,
                ),
                queueContext: resolvedExecution.created
                  ? this.buildWebhookQueueContext({
                      workflow,
                      webhookRequest: concurrentlyCreatedRequest,
                      execution: resolvedExecution.execution,
                      source,
                      idempotencyKey,
                      ip: input.ip,
                      userAgent: input.userAgent,
                    })
                  : null,
              };
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

        await this.usage.record({
          workspaceId: workflow.workspaceId,
          type: 'webhook_request',
          sourceType: 'webhook_request',
          sourceId: webhookRequest.id,
          createdAt: webhookRequest.createdAt,
          metadata: {
            workflowId: workflow.id,
            workflowPublicId: workflow.publicId,
            workflowVersion: workflow.version,
            source,
            idempotencyKey,
            payloadHash,
          },
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

        return {
          response: buildPublicWebhookResponse(webhookRequest, workflow, execution),
          queueContext: this.buildWebhookQueueContext({
            workflow,
            webhookRequest,
            execution,
            source,
            idempotencyKey,
            ip: input.ip,
            userAgent: input.userAgent,
          }),
        };
      },
    );

    if (result.queueContext) {
      await this.enqueueWebhookExecution(result.queueContext);
    }

    return result.response;
  }

  private async enqueueWebhookExecution(context: CreatedExecutionQueueContext): Promise<void> {
    const enqueuedAt = new Date();
    const enqueued = await this.executionQueue.enqueueExecution({
      workspaceId: context.workspaceId,
      workflowId: context.workflowId,
      executionId: context.executionId,
      isDemo: context.isDemo,
      ...(context.demoSessionId ? { demoSessionId: context.demoSessionId } : {}),
      correlationId: randomUUID(),
      causationId: context.webhookRequestId,
      enqueuedAt,
    });

    await this.auditLogs.create({
      workspaceId: context.workspaceId,
      actorUserId: null,
      action: 'execution.enqueued',
      entityType: 'execution',
      entityId: context.executionId,
      metadata: {
        workflowId: context.workflowId,
        workflowPublicId: context.workflowPublicId,
        workflowVersion: context.workflowVersion,
        triggerType: 'webhook',
        sourceId: context.webhookRequestId,
        source: context.source,
        idempotencyKey: context.idempotencyKey,
        queueName: enqueued.queueName,
        jobId: enqueued.jobId,
        jobName: enqueued.jobName,
        enqueuedAt: enqueued.enqueuedAt.toISOString(),
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private async resolveOrCreateWebhookExecution(input: {
    readonly webhookRequest: StoredWebhookRequestRecord;
    readonly workflow: StoredWorkflowRecord;
    readonly payload: ReturnType<typeof readWebhookPayload>;
  }): Promise<ResolvedWebhookExecution> {
    const existingExecution = await this.executions.findLatestByTriggerSource({
      workspaceId: input.workflow.workspaceId,
      isDemo: input.workflow.isDemo,
      demoSessionId: input.workflow.demoSessionId,
      workflowId: input.workflow.id,
      triggerType: 'webhook',
      sourceId: input.webhookRequest.id,
    });

    if (existingExecution) {
      return { execution: existingExecution, created: false };
    }

    return { execution: await this.createWebhookExecution(input), created: true };
  }

  private buildWebhookQueueContext(input: {
    readonly workflow: StoredWorkflowRecord;
    readonly webhookRequest: StoredWebhookRequestRecord;
    readonly execution: StoredExecutionRecord;
    readonly source: string;
    readonly idempotencyKey: string | null;
    readonly ip: string | null;
    readonly userAgent: string | null;
  }): CreatedExecutionQueueContext {
    return {
      workspaceId: input.workflow.workspaceId,
      workflowId: input.workflow.id,
      workflowPublicId: input.workflow.publicId,
      workflowVersion: input.workflow.version,
      isDemo: input.workflow.isDemo,
      demoSessionId: input.workflow.demoSessionId,
      executionId: input.execution.id,
      webhookRequestId: input.webhookRequest.id,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      ip: input.ip,
      userAgent: input.userAgent,
    };
  }

  private async createWebhookExecution(input: {
    readonly webhookRequest: StoredWebhookRequestRecord;
    readonly workflow: StoredWorkflowRecord;
    readonly payload: ReturnType<typeof readWebhookPayload>;
  }): Promise<StoredExecutionRecord> {
    const execution = await this.executions.createQueued({
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

    await this.usage.record({
      workspaceId: input.workflow.workspaceId,
      type: 'execution',
      sourceType: 'execution',
      sourceId: execution.id,
      createdAt: execution.createdAt,
      metadata: {
        workflowId: input.workflow.id,
        workflowPublicId: input.workflow.publicId,
        workflowVersion: input.workflow.version,
        triggerType: 'webhook',
        sourceId: input.webhookRequest.id,
        source: input.webhookRequest.source,
        idempotencyKey: input.webhookRequest.idempotencyKey,
      },
    });

    return execution;
  }
}
