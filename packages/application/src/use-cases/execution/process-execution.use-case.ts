import {
  ensureExecutionStatusTransition,
  executionJobScopeMismatch,
  executionNotFound,
  executionNotReadyForProcessing,
  executionWorkflowNotFound,
  executionWorkflowNotPublished,
  isDomainError,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  ExecutionRepositoryPort,
  StoredExecutionRecord,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';
import type { WorkflowExecutionEngine } from './execution-engine';

export interface ProcessExecutionUseCaseInput {
  readonly workspaceId: string;
  readonly executionId: string;
  readonly workflowId: string;
  readonly jobId: string;
  readonly correlationId: string;
}

export interface ProcessExecutionUseCaseResult {
  readonly execution: StoredExecutionRecord;
}

export class ProcessExecutionUseCase implements UseCase<
  ProcessExecutionUseCaseInput,
  ProcessExecutionUseCaseResult
> {
  constructor(
    private readonly executions: ExecutionRepositoryPort,
    private readonly workflows: WorkflowRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
    private readonly engine: WorkflowExecutionEngine,
  ) {}

  async execute(input: ProcessExecutionUseCaseInput): Promise<ProcessExecutionUseCaseResult> {
    const startedAt = new Date();
    const running = await this.transactionBoundary.execute(async () => {
      const execution = await this.executions.findByWorkspaceAndId({
        workspaceId: input.workspaceId,
        executionId: input.executionId,
      });

      if (!execution) {
        throw executionNotFound();
      }

      if (execution.workflowId !== input.workflowId) {
        throw executionJobScopeMismatch();
      }

      if (execution.status !== 'queued') {
        throw executionNotReadyForProcessing(execution.status);
      }

      ensureExecutionStatusTransition(execution.status, 'running');
      const markedRunning = await this.executions.markRunning({
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        startedAt,
      });

      if (!markedRunning) {
        throw executionNotReadyForProcessing(execution.status);
      }

      await this.auditLogs.create({
        workspaceId: input.workspaceId,
        actorUserId: null,
        action: 'execution.started',
        entityType: 'execution',
        entityId: input.executionId,
        metadata: {
          workflowId: input.workflowId,
          jobId: input.jobId,
          correlationId: input.correlationId,
          startedAt: startedAt.toISOString(),
          attempt: markedRunning.attempts,
        },
        ip: null,
        userAgent: null,
      });

      return markedRunning;
    });

    const workflow = await this.workflows.findByWorkspaceId({
      workspaceId: input.workspaceId,
      id: input.workflowId,
    });

    if (!workflow) {
      return {
        execution: await this.failExecution({
          input,
          startedAt,
          errorCode: 'EXECUTION_WORKFLOW_NOT_FOUND',
          errorMessage: executionWorkflowNotFound().message,
        }),
      };
    }

    if (workflow.status !== 'published') {
      return {
        execution: await this.failExecution({
          input,
          startedAt,
          errorCode: 'EXECUTION_WORKFLOW_NOT_PUBLISHED',
          errorMessage: executionWorkflowNotPublished().message,
        }),
      };
    }

    try {
      const result = await this.engine.execute({ execution: running, workflow, startedAt });
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      const succeeded = await this.transactionBoundary.execute(async () => {
        ensureExecutionStatusTransition('running', 'succeeded');
        const markedSucceeded = await this.executions.markSucceeded({
          workspaceId: input.workspaceId,
          executionId: input.executionId,
          output: result.output,
          finishedAt,
          durationMs,
        });

        if (!markedSucceeded) {
          throw executionNotReadyForProcessing('running');
        }

        await this.auditLogs.create({
          workspaceId: input.workspaceId,
          actorUserId: null,
          action: 'execution.succeeded',
          entityType: 'execution',
          entityId: input.executionId,
          metadata: {
            workflowId: input.workflowId,
            jobId: input.jobId,
            correlationId: input.correlationId,
            durationMs,
            attempts: markedSucceeded.attempts,
          },
          ip: null,
          userAgent: null,
        });

        return markedSucceeded;
      });

      return { execution: succeeded };
    } catch (error) {
      return {
        execution: await this.failExecution({
          input,
          startedAt,
          errorCode: resolveExecutionErrorCode(error),
          errorMessage: resolveExecutionErrorMessage(error),
        }),
      };
    }
  }

  private async failExecution(input: {
    readonly input: ProcessExecutionUseCaseInput;
    readonly startedAt: Date;
    readonly errorCode: string;
    readonly errorMessage: string;
  }): Promise<StoredExecutionRecord> {
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - input.startedAt.getTime());
    return this.transactionBoundary.execute(async () => {
      ensureExecutionStatusTransition('running', 'failed');
      const failed = await this.executions.markFailed({
        workspaceId: input.input.workspaceId,
        executionId: input.input.executionId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt,
        durationMs,
      });

      if (!failed) {
        throw executionNotReadyForProcessing('running');
      }

      await this.auditLogs.create({
        workspaceId: input.input.workspaceId,
        actorUserId: null,
        action: 'execution.failed',
        entityType: 'execution',
        entityId: input.input.executionId,
        metadata: {
          workflowId: input.input.workflowId,
          jobId: input.input.jobId,
          correlationId: input.input.correlationId,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          durationMs,
          attempts: failed.attempts,
        },
        ip: null,
        userAgent: null,
      });

      return failed;
    });
  }
}

function resolveExecutionErrorCode(error: unknown): string {
  if (isDomainError(error)) {
    return error.code;
  }

  return 'EXECUTION_PROCESSING_FAILED';
}

function resolveExecutionErrorMessage(error: unknown): string {
  if (isDomainError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Execution processing failed';
}
