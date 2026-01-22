import type { WorkspaceRuntimeScope } from '../workspace';
import type { JobEnvelope } from './job-envelope';

export const EXECUTION_JOB_NAMES = ['execution.process'] as const;

export type ExecutionJobName = (typeof EXECUTION_JOB_NAMES)[number];

export interface ExecutionJobPayload extends WorkspaceRuntimeScope {
  readonly executionId: string;
  readonly workflowId: string;
}

export type ExecutionJob = JobEnvelope<ExecutionJobName, ExecutionJobPayload>;
