import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import {
  EXECUTION_JOB_NAME,
  EXECUTION_QUEUE_NAME,
  JOB_CONTRACT_VERSION,
  type ExecutionJob,
  type ExecutionJobName,
} from '@runlane/contracts';
import { Worker, type Job } from 'bullmq';
import { StructuredLoggerService } from '../observability';
import { createBullMqRedisConnectionOptions } from './bullmq-connection';

const BULLMQ_KEY_PREFIX = 'runlane';

@Injectable()
export class BullMqExecutionWorkerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly worker: Worker<ExecutionJob, void, ExecutionJobName>;

  constructor(
    @Inject(RuntimeConfigService) config: RuntimeConfigService,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
  ) {
    this.worker = new Worker<ExecutionJob, void, ExecutionJobName>(
      EXECUTION_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: createBullMqRedisConnectionOptions(config.redisUrl),
        prefix: BULLMQ_KEY_PREFIX,
        concurrency: config.workerConcurrency,
        autorun: false,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.logEvent(
        'info',
        'Execution job completed',
        {
          jobId: job.id,
          jobName: job.name,
          workspaceId: job.data.payload.workspaceId,
          executionId: job.data.payload.executionId,
          workflowId: job.data.payload.workflowId,
        },
        BullMqExecutionWorkerProcessor.name,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.logEvent(
        'error',
        'Execution job failed',
        {
          jobId: job?.id,
          jobName: job?.name,
          workspaceId: job?.data.payload?.workspaceId,
          executionId: job?.data.payload?.executionId,
          workflowId: job?.data.payload?.workflowId,
          error,
        },
        BullMqExecutionWorkerProcessor.name,
      );
    });

    this.worker.on('error', (error) => {
      this.logger.logEvent(
        'error',
        'Execution worker queue error',
        { error },
        BullMqExecutionWorkerProcessor.name,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.worker.waitUntilReady();
    void this.worker.run().catch((error) => {
      this.logger.logEvent(
        'fatal',
        'Execution worker processor stopped unexpectedly',
        { error },
        BullMqExecutionWorkerProcessor.name,
      );
    });
    this.logger.logEvent(
      'info',
      'Execution worker processor started',
      {
        queueName: this.worker.name,
        concurrency: this.worker.opts.concurrency,
      },
      BullMqExecutionWorkerProcessor.name,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }

  private async process(job: Job<ExecutionJob, void, ExecutionJobName>): Promise<void> {
    assertExecutionJob(job);

    this.logger.logEvent(
      'info',
      'Execution job accepted by worker',
      {
        jobId: job.id,
        jobName: job.name,
        workspaceId: job.data.payload.workspaceId,
        executionId: job.data.payload.executionId,
        workflowId: job.data.payload.workflowId,
        correlationId: job.data.correlationId,
      },
      BullMqExecutionWorkerProcessor.name,
    );
  }
}

function assertExecutionJob(job: Job<ExecutionJob, void, ExecutionJobName>): void {
  const data = job.data;

  if (job.name !== EXECUTION_JOB_NAME || data.jobName !== EXECUTION_JOB_NAME) {
    throw new Error('Execution worker received an unsupported job name');
  }

  if (data.contractVersion !== JOB_CONTRACT_VERSION) {
    throw new Error('Execution worker received an unsupported job contract version');
  }

  if (job.id !== data.jobId) {
    throw new Error('Execution worker received a job with mismatched identity');
  }

  assertNonEmpty(data.correlationId, 'Execution job correlationId is required');
  assertNonEmpty(data.enqueuedAt, 'Execution job enqueuedAt is required');
  assertNonEmpty(data.payload.workspaceId, 'Execution job workspaceId is required');
  assertNonEmpty(data.payload.executionId, 'Execution job executionId is required');
  assertNonEmpty(data.payload.workflowId, 'Execution job workflowId is required');
}

function assertNonEmpty(value: unknown, message: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}
