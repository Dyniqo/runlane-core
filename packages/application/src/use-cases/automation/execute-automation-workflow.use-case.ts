import { randomUUID } from 'node:crypto';
import type { AutomationBridgeExecutionAcceptedDto } from '@runlane/contracts';
import {
  automationWorkflowNotAcceptingRequests,
  automationWorkflowNotFound,
  buildExecutionInputEnvelope,
  normalizeWorkflowPublicId,
  readAutomationBridgeRequest,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  ExecutionQueuePort,
  ExecutionRepositoryPort,
  StoredAuditLogRecord,
  StoredExecutionRecord,
  StoredWorkflowRecord,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '../../ports';
import type { ApiKeyScopeRecord } from '../access';
import type { UseCase } from '../use-case';
import {
  buildAutomationBridgeAcceptedResponse,
  readAutomationJsonValue,
} from './automation-response';

export interface ExecuteAutomationWorkflowUseCaseInput {
  readonly scope: ApiKeyScopeRecord;
  readonly workflowPublicId: string;
  readonly body: unknown;
  readonly source: string | null;
  readonly idempotencyKey: string | null;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

interface CreatedAutomationExecutionContext {
  readonly workflow: StoredWorkflowRecord;
  readonly auditLog: StoredAuditLogRecord;
  readonly execution: StoredExecutionRecord;
  readonly apiKeyId: string;
  readonly apiKeyPrefix: string;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly payloadHash: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

interface ExecuteAutomationWorkflowResult {
  readonly response: AutomationBridgeExecutionAcceptedDto;
  readonly queueContext: CreatedAutomationExecutionContext;
}

export class ExecuteAutomationWorkflowUseCase implements UseCase<
  ExecuteAutomationWorkflowUseCaseInput,
  AutomationBridgeExecutionAcceptedDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly executions: ExecutionRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly executionQueue: ExecutionQueuePort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  async execute(
    input: ExecuteAutomationWorkflowUseCaseInput,
  ): Promise<AutomationBridgeExecutionAcceptedDto> {
    const publicId = normalizeWorkflowPublicId(input.workflowPublicId);
    const bridgeRequest = readAutomationBridgeRequest({
      body: input.body,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
    });

    const result = await this.transactionBoundary.execute(
      async (): Promise<ExecuteAutomationWorkflowResult> => {
        const workflow = await this.workflows.findPublishedByPublicId(publicId);

        if (!workflow || workflow.workspaceId !== input.scope.workspaceId) {
          throw automationWorkflowNotFound();
        }

        if (workflow.triggerType !== 'automation') {
          throw automationWorkflowNotAcceptingRequests();
        }

        const auditLog = await this.auditLogs.create({
          workspaceId: workflow.workspaceId,
          actorUserId: null,
          action: 'automation.bridge_request_received',
          entityType: 'workflow',
          entityId: workflow.id,
          metadata: {
            apiKeyId: input.scope.apiKeyId,
            apiKeyPrefix: input.scope.prefix,
            workflowPublicId: workflow.publicId,
            workflowVersion: workflow.version,
            source: bridgeRequest.source,
            idempotencyKey: bridgeRequest.idempotencyKey,
            payloadHash: bridgeRequest.payloadHash,
            payload: readAutomationJsonValue(bridgeRequest.payload),
            metadata: readAutomationJsonValue(bridgeRequest.metadata),
          },
          ip: input.ip,
          userAgent: input.userAgent,
        });

        const execution = await this.executions.createQueued({
          workspaceId: workflow.workspaceId,
          workflowId: workflow.id,
          input: buildExecutionInputEnvelope({
            triggerType: 'automation_bridge',
            sourceId: auditLog.id,
            source: bridgeRequest.source,
            idempotencyKey: bridgeRequest.idempotencyKey,
            workflowPublicId: workflow.publicId,
            workflowVersion: workflow.version,
            acceptedAt: auditLog.createdAt,
            payload: bridgeRequest.payload,
            metadata: {
              apiKeyId: input.scope.apiKeyId,
              apiKeyPrefix: input.scope.prefix,
              payloadHash: bridgeRequest.payloadHash,
              requestMetadata: bridgeRequest.metadata,
            },
          }),
          queuedAt: auditLog.createdAt,
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
            triggerType: 'automation_bridge',
            sourceId: auditLog.id,
            source: bridgeRequest.source,
            idempotencyKey: bridgeRequest.idempotencyKey,
            apiKeyId: input.scope.apiKeyId,
            apiKeyPrefix: input.scope.prefix,
          },
          ip: input.ip,
          userAgent: input.userAgent,
        });

        return {
          response: buildAutomationBridgeAcceptedResponse({
            workflow,
            auditLog,
            execution,
            source: bridgeRequest.source,
            idempotencyKey: bridgeRequest.idempotencyKey,
            payloadHash: bridgeRequest.payloadHash,
          }),
          queueContext: {
            workflow,
            auditLog,
            execution,
            apiKeyId: input.scope.apiKeyId,
            apiKeyPrefix: input.scope.prefix,
            source: bridgeRequest.source,
            idempotencyKey: bridgeRequest.idempotencyKey,
            payloadHash: bridgeRequest.payloadHash,
            ip: input.ip,
            userAgent: input.userAgent,
          },
        };
      },
    );

    await this.enqueueAutomationExecution(result.queueContext);

    return result.response;
  }

  private async enqueueAutomationExecution(
    context: CreatedAutomationExecutionContext,
  ): Promise<void> {
    const enqueued = await this.executionQueue.enqueueExecution({
      workspaceId: context.workflow.workspaceId,
      workflowId: context.workflow.id,
      executionId: context.execution.id,
      isDemo: false,
      correlationId: randomUUID(),
      causationId: context.auditLog.id,
      enqueuedAt: new Date(),
    });

    await this.auditLogs.create({
      workspaceId: context.workflow.workspaceId,
      actorUserId: null,
      action: 'execution.enqueued',
      entityType: 'execution',
      entityId: context.execution.id,
      metadata: {
        workflowId: context.workflow.id,
        workflowPublicId: context.workflow.publicId,
        workflowVersion: context.workflow.version,
        triggerType: 'automation_bridge',
        sourceId: context.auditLog.id,
        source: context.source,
        idempotencyKey: context.idempotencyKey,
        apiKeyId: context.apiKeyId,
        apiKeyPrefix: context.apiKeyPrefix,
        payloadHash: context.payloadHash,
        queueName: enqueued.queueName,
        jobId: enqueued.jobId,
        jobName: enqueued.jobName,
        enqueuedAt: enqueued.enqueuedAt.toISOString(),
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}
