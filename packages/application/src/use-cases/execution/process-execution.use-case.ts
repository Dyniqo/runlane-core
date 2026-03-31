import {
  classifyExecutionRetryError,
  ensureExecutionStatusTransition,
  executionDeadLetterNotReady,
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
  ExecutionRetryPolicy,
  NotificationConnectorPort,
  StoredExecutionRecord,
  TransactionBoundary,
  WorkflowRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';
import type { UsageRecorder } from '../usage';
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

export class ExecutionRetryScheduledError extends Error {
  constructor(
    readonly executionId: string,
    readonly attempt: number,
    readonly maxAttempts: number,
    readonly retryDelayMs: number,
    readonly errorCode: string,
  ) {
    super('Execution retry has been scheduled');
    this.name = 'ExecutionRetryScheduledError';
  }
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
    private readonly retryPolicy: ExecutionRetryPolicy,
    private readonly notifications: NotificationConnectorPort,
    private readonly usage: UsageRecorder,
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

      if (execution.status !== 'queued' && execution.status !== 'retrying') {
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
          maxAttempts: this.retryPolicy.maxAttempts,
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
          running,
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
          running,
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
            maxAttempts: this.retryPolicy.maxAttempts,
          },
          ip: null,
          userAgent: null,
        });

        return markedSucceeded;
      });

      return { execution: succeeded };
    } catch (error) {
      const errorCode = resolveExecutionErrorCode(error);
      const errorMessage = resolveExecutionErrorMessage(error);
      const retry = classifyExecutionRetryError({
        errorCode,
        errorCategory: isDomainError(error) ? error.category : 'internal',
        attempt: running.attempts,
        maxAttempts: this.retryPolicy.maxAttempts,
        baseDelayMs: this.retryPolicy.baseDelayMs,
        maxDelayMs: this.retryPolicy.maxDelayMs,
      });

      if (retry.shouldRetry) {
        await this.retryExecution({
          input,
          startedAt,
          running,
          errorCode,
          errorMessage,
          retryDelayMs: retry.delayMs,
        });

        throw new ExecutionRetryScheduledError(
          input.executionId,
          running.attempts,
          this.retryPolicy.maxAttempts,
          retry.delayMs,
          errorCode,
        );
      }

      return {
        execution: retry.retryable
          ? await this.deadLetterExecution({
              input,
              startedAt,
              running,
              errorCode,
              errorMessage,
            })
          : await this.failExecution({
              input,
              startedAt,
              running,
              errorCode,
              errorMessage,
            }),
      };
    }
  }

  private async retryExecution(input: {
    readonly input: ProcessExecutionUseCaseInput;
    readonly startedAt: Date;
    readonly running: StoredExecutionRecord;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly retryDelayMs: number;
  }): Promise<StoredExecutionRecord> {
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - input.startedAt.getTime());
    return this.transactionBoundary.execute(async () => {
      ensureExecutionStatusTransition('running', 'retrying');
      const retrying = await this.executions.markRetrying({
        workspaceId: input.input.workspaceId,
        executionId: input.input.executionId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt,
        durationMs,
      });

      if (!retrying) {
        throw executionNotReadyForProcessing('running');
      }

      await this.auditLogs.create({
        workspaceId: input.input.workspaceId,
        actorUserId: null,
        action: 'execution.retrying',
        entityType: 'execution',
        entityId: input.input.executionId,
        metadata: {
          workflowId: input.input.workflowId,
          executionId: input.input.executionId,
          jobId: input.input.jobId,
          correlationId: input.input.correlationId,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          durationMs,
          attempt: input.running.attempts,
          maxAttempts: this.retryPolicy.maxAttempts,
          retryDelayMs: input.retryDelayMs,
        },
        ip: null,
        userAgent: null,
      });

      await this.usage.record({
        workspaceId: input.input.workspaceId,
        type: 'retry',
        sourceType: 'execution_retry',
        sourceId: `${input.input.executionId}:${input.startedAt.toISOString()}:${input.running.attempts}`,
        createdAt: finishedAt,
        metadata: {
          workflowId: input.input.workflowId,
          executionId: input.input.executionId,
          jobId: input.input.jobId,
          correlationId: input.input.correlationId,
          errorCode: input.errorCode,
          durationMs,
          attempt: input.running.attempts,
          maxAttempts: this.retryPolicy.maxAttempts,
          retryDelayMs: input.retryDelayMs,
        },
      });

      return retrying;
    });
  }

  private async deadLetterExecution(input: {
    readonly input: ProcessExecutionUseCaseInput;
    readonly startedAt: Date;
    readonly running: StoredExecutionRecord;
    readonly errorCode: string;
    readonly errorMessage: string;
  }): Promise<StoredExecutionRecord> {
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - input.startedAt.getTime());
    const deadLettered = await this.transactionBoundary.execute(async () => {
      ensureExecutionStatusTransition('running', 'dead_letter');
      const markedDeadLetter = await this.executions.markDeadLetter({
        workspaceId: input.input.workspaceId,
        executionId: input.input.executionId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt,
        durationMs,
      });

      if (!markedDeadLetter) {
        throw executionDeadLetterNotReady('running');
      }

      await this.auditLogs.create({
        workspaceId: input.input.workspaceId,
        actorUserId: null,
        action: 'execution.dead_lettered',
        entityType: 'execution',
        entityId: input.input.executionId,
        metadata: {
          workflowId: input.input.workflowId,
          executionId: input.input.executionId,
          jobId: input.input.jobId,
          correlationId: input.input.correlationId,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          durationMs,
          attempts: markedDeadLetter.attempts,
          maxAttempts: this.retryPolicy.maxAttempts,
        },
        ip: null,
        userAgent: null,
      });

      return markedDeadLetter;
    });

    await this.sendFailureAlert({
      input: input.input,
      status: 'dead_letter',
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      attempt: deadLettered.attempts,
      durationMs,
    });

    return deadLettered;
  }

  private async failExecution(input: {
    readonly input: ProcessExecutionUseCaseInput;
    readonly startedAt: Date;
    readonly running: StoredExecutionRecord;
    readonly errorCode: string;
    readonly errorMessage: string;
  }): Promise<StoredExecutionRecord> {
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - input.startedAt.getTime());
    const failed = await this.transactionBoundary.execute(async () => {
      ensureExecutionStatusTransition('running', 'failed');
      const markedFailed = await this.executions.markFailed({
        workspaceId: input.input.workspaceId,
        executionId: input.input.executionId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt,
        durationMs,
      });

      if (!markedFailed) {
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
          executionId: input.input.executionId,
          jobId: input.input.jobId,
          correlationId: input.input.correlationId,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          durationMs,
          attempts: markedFailed.attempts,
          maxAttempts: this.retryPolicy.maxAttempts,
        },
        ip: null,
        userAgent: null,
      });

      return markedFailed;
    });

    await this.sendFailureAlert({
      input: input.input,
      status: 'failed',
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      attempt: failed.attempts,
      durationMs,
    });

    return failed;
  }

  private async sendFailureAlert(input: {
    readonly input: ProcessExecutionUseCaseInput;
    readonly status: 'failed' | 'dead_letter';
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly attempt: number;
    readonly durationMs: number;
  }): Promise<void> {
    try {
      await this.notifications.sendExecutionFailureAlert({
        workspaceId: input.input.workspaceId,
        workflowId: input.input.workflowId,
        executionId: input.input.executionId,
        jobId: input.input.jobId,
        correlationId: input.input.correlationId,
        status: input.status,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        attempt: input.attempt,
        maxAttempts: this.retryPolicy.maxAttempts,
        durationMs: input.durationMs,
      });
    } catch {
      return;
    }
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
