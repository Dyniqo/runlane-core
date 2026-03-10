import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateRunningExecutionStepInput,
  ExecutionStepRepositoryPort,
  ListExecutionStepsInput,
  MarkExecutionStepFailedInput,
  MarkExecutionStepSucceededInput,
  StoredExecutionStepRecord,
} from '@runlane/application';
import type { JsonObject } from '@runlane/contracts';
import type { ExecutionStepStatus, WorkflowStepType } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaExecutionStepRepository implements ExecutionStepRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async createRunning(input: CreateRunningExecutionStepInput): Promise<StoredExecutionStepRecord> {
    const step = await this.persistence.client.executionStep.upsert({
      where: {
        workspaceId_executionId_stepKey: {
          workspaceId: input.workspaceId,
          executionId: input.executionId,
          stepKey: input.stepKey,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        stepKey: input.stepKey,
        type: input.type,
        status: 'RUNNING',
        inputJson: input.input as Prisma.InputJsonValue,
        startedAt: input.startedAt,
      },
      update: {
        type: input.type,
        status: 'RUNNING',
        inputJson: input.input as Prisma.InputJsonValue,
        outputJson: Prisma.DbNull,
        errorCode: null,
        errorMessage: null,
        durationMs: null,
        startedAt: input.startedAt,
        finishedAt: null,
      },
      select: executionStepSelect,
    });

    return mapExecutionStepRecord(step);
  }

  async markSucceeded(
    input: MarkExecutionStepSucceededInput,
  ): Promise<StoredExecutionStepRecord | null> {
    const updated = await this.persistence.client.executionStep.updateMany({
      where: {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        stepKey: input.stepKey,
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

    return this.findByStepKey(input);
  }

  async markFailed(input: MarkExecutionStepFailedInput): Promise<StoredExecutionStepRecord | null> {
    const updated = await this.persistence.client.executionStep.updateMany({
      where: {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        stepKey: input.stepKey,
        status: 'RUNNING',
      },
      data: {
        status: 'FAILED',
        outputJson: Prisma.DbNull,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs,
        finishedAt: input.finishedAt,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findByStepKey(input);
  }

  async listByExecution(
    input: ListExecutionStepsInput,
  ): Promise<readonly StoredExecutionStepRecord[]> {
    const steps = await this.persistence.client.executionStep.findMany({
      where: {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: executionStepSelect,
    });

    return steps.map(mapExecutionStepRecord);
  }

  private async findByStepKey(input: {
    readonly workspaceId: string;
    readonly executionId: string;
    readonly stepKey: string;
  }): Promise<StoredExecutionStepRecord | null> {
    const step = await this.persistence.client.executionStep.findFirst({
      where: {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        stepKey: input.stepKey,
      },
      select: executionStepSelect,
    });

    return step ? mapExecutionStepRecord(step) : null;
  }
}

const executionStepSelect = {
  id: true,
  workspaceId: true,
  executionId: true,
  stepKey: true,
  type: true,
  status: true,
  inputJson: true,
  outputJson: true,
  errorCode: true,
  errorMessage: true,
  durationMs: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
} as const;

type PrismaExecutionStepRecord = {
  readonly id: string;
  readonly workspaceId: string;
  readonly executionId: string;
  readonly stepKey: string;
  readonly type: string;
  readonly status: string;
  readonly inputJson: Prisma.JsonValue;
  readonly outputJson: Prisma.JsonValue | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly durationMs: number | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
};

function mapExecutionStepRecord(record: PrismaExecutionStepRecord): StoredExecutionStepRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    executionId: record.executionId,
    stepKey: record.stepKey,
    type: mapWorkflowStepType(record.type),
    status: mapExecutionStepStatus(record.status),
    input: record.inputJson as JsonObject,
    output: record.outputJson === null ? null : (record.outputJson as JsonObject),
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    durationMs: record.durationMs,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    createdAt: record.createdAt,
  };
}

function mapExecutionStepStatus(status: string): ExecutionStepStatus {
  if (status === 'RUNNING') {
    return 'running';
  }

  if (status === 'SUCCEEDED') {
    return 'succeeded';
  }

  if (status === 'FAILED') {
    return 'failed';
  }

  throw new TypeError(`Unsupported execution step status '${status}'`);
}

function mapWorkflowStepType(type: string): WorkflowStepType {
  if (
    type === 'http' ||
    type === 'ai_decision' ||
    type === 'notification' ||
    type === 'condition'
  ) {
    return type;
  }

  throw new TypeError(`Unsupported execution step type '${type}'`);
}
