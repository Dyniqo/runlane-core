import type { WorkspaceRuntimeScope } from '../workspace';
import { JOB_CONTRACT_VERSION, type JobEnvelope } from './job-envelope';

export const EXECUTION_QUEUE_NAME = 'execution' as const;
export const EXECUTION_JOB_NAME = 'execution.process' as const;
export const EXECUTION_JOB_NAMES = [EXECUTION_JOB_NAME] as const;

export type ExecutionJobName = (typeof EXECUTION_JOB_NAMES)[number];

export interface ExecutionJobPayload extends WorkspaceRuntimeScope {
  readonly executionId: string;
  readonly workflowId: string;
}

export type ExecutionJob = JobEnvelope<ExecutionJobName, ExecutionJobPayload>;

export interface CreateExecutionJobInput extends ExecutionJobPayload {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly enqueuedAt: Date;
}

export function createExecutionJob(input: CreateExecutionJobInput): ExecutionJob {
  const baseJob = {
    contractVersion: JOB_CONTRACT_VERSION,
    jobId: executionJobId(input.workspaceId, input.executionId),
    jobName: EXECUTION_JOB_NAME,
    correlationId: input.correlationId,
    enqueuedAt: input.enqueuedAt.toISOString(),
    payload: {
      workspaceId: input.workspaceId,
      executionId: input.executionId,
      workflowId: input.workflowId,
      isDemo: input.isDemo,
      ...(input.demoSessionId ? { demoSessionId: input.demoSessionId } : {}),
    },
  } satisfies Omit<ExecutionJob, 'causationId'>;

  return input.causationId ? { ...baseJob, causationId: input.causationId } : baseJob;
}

export function executionJobId(workspaceId: string, executionId: string): string {
  return `execution:${workspaceId}:${executionId}`;
}
