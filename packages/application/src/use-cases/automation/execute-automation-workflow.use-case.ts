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
  ExecutionRepositoryPort,
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

export class ExecuteAutomationWorkflowUseCase implements UseCase<
  ExecuteAutomationWorkflowUseCaseInput,
  AutomationBridgeExecutionAcceptedDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly executions: ExecutionRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(
    input: ExecuteAutomationWorkflowUseCaseInput,
  ): Promise<AutomationBridgeExecutionAcceptedDto> {
    const publicId = normalizeWorkflowPublicId(input.workflowPublicId);
    const bridgeRequest = readAutomationBridgeRequest({
      body: input.body,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
    });

    return this.transactionBoundary.execute(async () => {
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

      return buildAutomationBridgeAcceptedResponse({
        workflow,
        auditLog,
        execution,
        source: bridgeRequest.source,
        idempotencyKey: bridgeRequest.idempotencyKey,
        payloadHash: bridgeRequest.payloadHash,
      });
    });
  }
}
