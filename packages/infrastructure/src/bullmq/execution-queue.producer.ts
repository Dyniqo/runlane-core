import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  EXECUTION_QUEUE,
  type EnqueuedExecutionJobRecord,
  type EnqueueExecutionJobInput,
  type ExecutionQueueHealthRecord,
  type ExecutionQueuePort,
} from '@runlane/application';
import { RuntimeConfigService } from '@runlane/config';
import {
  createExecutionJob,
  EXECUTION_QUEUE_NAME,
  type ExecutionJob,
  type ExecutionJobName,
} from '@runlane/contracts';
import { Queue } from 'bullmq';
import { StructuredLoggerService } from '../observability';
import { createBullMqRedisConnectionOptions } from './bullmq-connection';

const BULLMQ_KEY_PREFIX = 'runlane';
const COMPLETED_JOB_RETENTION = { age: 86_400, count: 1_000 } as const;
const FAILED_JOB_RETENTION = { age: 604_800, count: 5_000 } as const;

@Injectable()
export class BullMqExecutionQueueProducer
  implements ExecutionQueuePort, OnModuleInit, OnModuleDestroy
{
  private readonly queue: Queue<ExecutionJob, void, ExecutionJobName>;
  private readonly retryMaxAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(
    @Inject(RuntimeConfigService) config: RuntimeConfigService,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
  ) {
    this.retryMaxAttempts = config.executionRetryMaxAttempts;
    this.retryBaseDelayMs = config.executionRetryBaseDelayMs;
    this.queue = new Queue<ExecutionJob, void, ExecutionJobName>(EXECUTION_QUEUE_NAME, {
      connection: createBullMqRedisConnectionOptions(config.redisUrl),
      prefix: BULLMQ_KEY_PREFIX,
      defaultJobOptions: {
        attempts: this.retryMaxAttempts,
        backoff: {
          type: 'exponential',
          delay: this.retryBaseDelayMs,
        },
        removeOnComplete: COMPLETED_JOB_RETENTION,
        removeOnFail: FAILED_JOB_RETENTION,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.waitUntilReady();
    this.logger.logEvent(
      'info',
      'Execution queue producer connected',
      { queueName: this.queue.name },
      BullMqExecutionQueueProducer.name,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async enqueueExecution(input: EnqueueExecutionJobInput): Promise<EnqueuedExecutionJobRecord> {
    const job = createExecutionJob({
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      workflowId: input.workflowId,
      isDemo: input.isDemo,
      ...(input.demoSessionId ? { demoSessionId: input.demoSessionId } : {}),
      correlationId: input.correlationId,
      ...(input.causationId ? { causationId: input.causationId } : {}),
      enqueuedAt: input.enqueuedAt,
    });

    const queuedJob = await this.queue.add(job.jobName, job, {
      jobId: job.jobId,
      attempts: this.retryMaxAttempts,
      backoff: {
        type: 'exponential',
        delay: this.retryBaseDelayMs,
      },
      delay: input.retryDelayMs ?? 0,
      removeOnComplete: COMPLETED_JOB_RETENTION,
      removeOnFail: FAILED_JOB_RETENTION,
    });

    this.logger.logEvent(
      'info',
      'Execution job enqueued',
      {
        queueName: this.queue.name,
        jobId: queuedJob.id ?? job.jobId,
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        workflowId: input.workflowId,
        retryDelayMs: input.retryDelayMs ?? 0,
        retryMaxAttempts: this.retryMaxAttempts,
      },
      BullMqExecutionQueueProducer.name,
    );

    return {
      queueName: this.queue.name,
      jobId: queuedJob.id ?? job.jobId,
      jobName: job.jobName,
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      workflowId: input.workflowId,
      enqueuedAt: input.enqueuedAt,
    };
  }

  async getHealth(): Promise<ExecutionQueueHealthRecord> {
    await this.queue.waitUntilReady();
    const counts = await this.queue.getJobCounts(
      'waiting',
      'delayed',
      'active',
      'failed',
      'completed',
      'paused',
    );

    return {
      queueName: this.queue.name,
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
      paused: counts.paused ?? 0,
    };
  }
}

export const executionQueueProvider = {
  provide: EXECUTION_QUEUE,
  useExisting: BullMqExecutionQueueProducer,
} as const;
