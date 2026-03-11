import { randomUUID } from 'node:crypto';
import type { ExecutionResponseDto } from '@runlane/contracts';
import {
  ensureExecutionStatusTransition,
  executionManualRetryNotAllowed,
  executionNotFound,
  executionWorkflowNotFound,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  ExecutionQueuePort,
  ExecutionRepositoryPort,
  StoredExecutionRecord,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildExecutionResponse } from './execution-response';

export interface RetryExecutionUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly executionId: string;
  readonly actorUserId: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

interface RetryExecutionTransactionResult {
  readonly execution: StoredExecutionRecord;
  readonly previousAttempts: number;
  readonly previousErrorCode: string | null;
  readonly previousErrorMessage: string | null;
}

export class RetryExecutionUseCase implements UseCase<
  RetryExecutionUseCaseInput,
  ExecutionResponseDto
> {
  constructor(
    private readonly executions: ExecutionRepositoryPort,
    private readonly workflows: WorkflowRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly executionQueue: ExecutionQueuePort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  async execute(input: RetryExecutionUseCaseInput): Promise<ExecutionResponseDto> {
    const queuedAt = new Date();
    const result = await this.transactionBoundary.execute(
      async (): Promise<RetryExecutionTransactionResult> => {
        const existing = await this.executions.findByWorkspaceAndId({
          workspaceId: input.scope.workspaceId,
          executionId: input.executionId,
        });

        if (!existing) {
          throw executionNotFound();
        }

        if (existing.status !== 'dead_letter') {
          throw executionManualRetryNotAllowed(existing.status);
        }

        ensureExecutionStatusTransition('dead_letter', 'queued');
        const queued = await this.executions.markQueuedForManualRetry({
          workspaceId: input.scope.workspaceId,
          executionId: input.executionId,
          queuedAt,
        });

        if (!queued) {
          throw executionManualRetryNotAllowed(existing.status);
        }

        await this.auditLogs.create({
          workspaceId: input.scope.workspaceId,
          actorUserId: input.actorUserId,
          action: 'execution.manual_retry_requested',
          entityType: 'execution',
          entityId: input.executionId,
          metadata: {
            workflowId: queued.workflowId,
            previousStatus: existing.status,
            previousAttempts: existing.attempts,
            previousErrorCode: existing.errorCode,
            previousErrorMessage: existing.errorMessage,
            queuedAt: queuedAt.toISOString(),
          },
          ip: input.ip,
          userAgent: input.userAgent,
        });

        return {
          execution: queued,
          previousAttempts: existing.attempts,
          previousErrorCode: existing.errorCode,
          previousErrorMessage: existing.errorMessage,
        };
      },
    );

    const workflow = await this.workflows.findByWorkspaceId({
      workspaceId: input.scope.workspaceId,
      id: result.execution.workflowId,
    });

    if (!workflow) {
      throw executionWorkflowNotFound();
    }

    const enqueued = await this.executionQueue.enqueueExecution({
      workspaceId: result.execution.workspaceId,
      workflowId: result.execution.workflowId,
      executionId: result.execution.id,
      isDemo: false,
      correlationId: randomUUID(),
      ...(input.actorUserId ? { causationId: input.actorUserId } : {}),
      enqueuedAt: queuedAt,
      replaceExisting: true,
    });

    await this.auditLogs.create({
      workspaceId: input.scope.workspaceId,
      actorUserId: input.actorUserId,
      action: 'execution.enqueued',
      entityType: 'execution',
      entityId: result.execution.id,
      metadata: {
        workflowId: result.execution.workflowId,
        workflowPublicId: workflow.publicId,
        workflowVersion: workflow.version,
        triggerType: 'manual',
        sourceId: result.execution.id,
        previousAttempts: result.previousAttempts,
        previousErrorCode: result.previousErrorCode,
        previousErrorMessage: result.previousErrorMessage,
        queueName: enqueued.queueName,
        jobId: enqueued.jobId,
        jobName: enqueued.jobName,
        enqueuedAt: enqueued.enqueuedAt.toISOString(),
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { execution: buildExecutionResponse(result.execution, workflow) };
  }
}
