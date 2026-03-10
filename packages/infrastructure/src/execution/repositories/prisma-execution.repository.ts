import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateQueuedExecutionInput,
  FindExecutionByTriggerSourceInput,
  FindExecutionByWorkspaceAndIdInput,
  MarkExecutionFailedInput,
  MarkExecutionRetryingInput,
  MarkExecutionRunningInput,
  MarkExecutionSucceededInput,
  StoredExecutionRecord,
  ExecutionRepositoryPort,
} from '@runlane/application';
import type { JsonObject } from '@runlane/contracts';
import type { ExecutionStatus } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaExecutionRepository implements ExecutionRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async createQueued(input: CreateQueuedExecutionInput): Promise<StoredExecutionRecord> {
    const execution = await this.persistence.client.execution.create({
      data: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        status: 'QUEUED',
        inputJson: input.input as Prisma.InputJsonValue,
        queuedAt: input.queuedAt,
      },
      select: executionSelect,
    });

    return mapExecutionRecord(execution);
  }

  async findByWorkspaceAndId(
    input: FindExecutionByWorkspaceAndIdInput,
  ): Promise<StoredExecutionRecord | null> {
    const execution = await this.persistence.client.execution.findFirst({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
      },
      select: executionSelect,
    });

    return execution ? mapExecutionRecord(execution) : null;
  }

  async findLatestByTriggerSource(
    input: FindExecutionByTriggerSourceInput,
  ): Promise<StoredExecutionRecord | null> {
    const execution = await this.persistence.client.execution.findFirst({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        inputJson: {
          path: ['trigger', 'type'],
          equals: input.triggerType,
        },
        AND: [
          {
            inputJson: {
              path: ['trigger', 'sourceId'],
              equals: input.sourceId,
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: executionSelect,
    });

    return execution ? mapExecutionRecord(execution) : null;
  }

  async markRunning(input: MarkExecutionRunningInput): Promise<StoredExecutionRecord | null> {
    const updated = await this.persistence.client.execution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        status: { in: ['QUEUED', 'RETRYING'] },
      },
      data: {
        status: 'RUNNING',
        startedAt: input.startedAt,
        attempts: { increment: 1 },
        finishedAt: null,
        durationMs: null,
        outputJson: Prisma.DbNull,
        errorCode: null,
        errorMessage: null,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByWorkspaceAndId(input);
  }

  async markSucceeded(input: MarkExecutionSucceededInput): Promise<StoredExecutionRecord | null> {
    const updated = await this.persistence.client.execution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        status: 'RUNNING',
      },
      data: {
        status: 'SUCCEEDED',
        outputJson: input.output as Prisma.InputJsonValue,
        errorCode: null,
        errorMessage: null,
        durationMs: input.durationMs,
        finishedAt: input.finishedAt,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByWorkspaceAndId(input);
  }

  async markRetrying(input: MarkExecutionRetryingInput): Promise<StoredExecutionRecord | null> {
    const updated = await this.persistence.client.execution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        status: 'RUNNING',
      },
      data: {
        status: 'RETRYING',
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs,
        finishedAt: input.finishedAt,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByWorkspaceAndId(input);
  }

  async markFailed(input: MarkExecutionFailedInput): Promise<StoredExecutionRecord | null> {
    const updated = await this.persistence.client.execution.updateMany({
      where: {
        id: input.executionId,
        workspaceId: input.workspaceId,
        status: 'RUNNING',
      },
      data: {
        status: 'FAILED',
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs,
        finishedAt: input.finishedAt,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByWorkspaceAndId(input);
  }
}

const executionSelect = {
  id: true,
  workspaceId: true,
  workflowId: true,
  status: true,
  inputJson: true,
  outputJson: true,
  errorCode: true,
  errorMessage: true,
  attempts: true,
  durationMs: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
} as const;

type PrismaExecutionRecord = {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly status: string;
  readonly inputJson: Prisma.JsonValue;
  readonly outputJson: Prisma.JsonValue | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly attempts: number;
  readonly durationMs: number | null;
  readonly queuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
};

function mapExecutionRecord(record: PrismaExecutionRecord): StoredExecutionRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    workflowId: record.workflowId,
    status: mapExecutionStatus(record.status),
    input: record.inputJson as JsonObject,
    output: record.outputJson === null ? null : (record.outputJson as JsonObject),
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    attempts: record.attempts,
    durationMs: record.durationMs,
    queuedAt: record.queuedAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    createdAt: record.createdAt,
  };
}

function mapExecutionStatus(status: string): ExecutionStatus {
  if (status === 'QUEUED') {
    return 'queued';
  }

  if (status === 'RUNNING') {
    return 'running';
  }

  if (status === 'SUCCEEDED') {
    return 'succeeded';
  }

  if (status === 'FAILED') {
    return 'failed';
  }

  if (status === 'RETRYING') {
    return 'retrying';
  }

  if (status === 'DEAD_LETTER') {
    return 'dead_letter';
  }

  if (status === 'CANCELLED') {
    return 'cancelled';
  }

  throw new TypeError(`Unsupported execution status '${status}'`);
}
