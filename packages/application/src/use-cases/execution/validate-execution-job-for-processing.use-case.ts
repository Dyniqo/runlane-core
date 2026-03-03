import { executionJobScopeMismatch, executionNotFound } from '@runlane/domain';
import type { ExecutionRepositoryPort, StoredExecutionRecord } from '../../ports';
import type { UseCase } from '../use-case';

export interface ValidateExecutionJobForProcessingInput {
  readonly workspaceId: string;
  readonly executionId: string;
  readonly workflowId: string;
}

export interface ValidatedExecutionJobForProcessingRecord {
  readonly execution: StoredExecutionRecord;
}

export class ValidateExecutionJobForProcessingUseCase implements UseCase<
  ValidateExecutionJobForProcessingInput,
  ValidatedExecutionJobForProcessingRecord
> {
  constructor(private readonly executions: ExecutionRepositoryPort) {}

  async execute(
    input: ValidateExecutionJobForProcessingInput,
  ): Promise<ValidatedExecutionJobForProcessingRecord> {
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

    return { execution };
  }
}
