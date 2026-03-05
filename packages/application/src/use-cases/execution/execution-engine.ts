import type { JsonObject } from '@runlane/contracts';
import {
  DomainError,
  executionStepCycleDetected,
  executionStepRunnerMissing,
  executionStepTargetMissing,
  readExecutionInput,
  readWorkflowDefinition,
} from '@runlane/domain';
import type {
  ExecutionInputEnvelope,
  WorkflowDefinition,
  WorkflowStepDefinitionValue,
} from '@runlane/domain';
import type { StoredExecutionRecord, StoredWorkflowRecord } from '../../ports';

export interface WorkflowExecutionEngineInput {
  readonly execution: StoredExecutionRecord;
  readonly workflow: StoredWorkflowRecord;
  readonly startedAt: Date;
}

export interface WorkflowExecutionEngineResult {
  readonly output: JsonObject;
}

interface ExecutedStepSnapshot extends JsonObject {
  readonly key: string;
  readonly name: string;
  readonly type: string;
  readonly status: 'succeeded';
  readonly output: JsonObject;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
}

interface StepExecutionContext {
  readonly execution: StoredExecutionRecord;
  readonly workflow: StoredWorkflowRecord;
  readonly definition: WorkflowDefinition;
  readonly input: ExecutionInputEnvelope;
  readonly previousSteps: readonly ExecutedStepSnapshot[];
}

export class WorkflowExecutionEngine {
  async execute(input: WorkflowExecutionEngineInput): Promise<WorkflowExecutionEngineResult> {
    const definition = readWorkflowDefinition(input.workflow.definition, {
      triggerType: input.workflow.triggerType,
    });
    const executionInput = readExecutionInput(input.execution.input);
    const stepMap = new Map(definition.steps.map((step) => [step.key, step]));
    const snapshots: ExecutedStepSnapshot[] = [];
    const visitedSteps = new Set<string>();
    let currentStepKey: string | undefined = definition.entryStepKey;

    while (currentStepKey) {
      if (visitedSteps.has(currentStepKey)) {
        throw executionStepCycleDetected(currentStepKey);
      }

      const step = stepMap.get(currentStepKey);

      if (!step) {
        throw executionStepTargetMissing(currentStepKey);
      }

      visitedSteps.add(currentStepKey);

      const snapshot = await this.executeStep(step, {
        execution: input.execution,
        workflow: input.workflow,
        definition,
        input: executionInput,
        previousSteps: snapshots,
      });

      snapshots.push(snapshot);
      currentStepKey = resolveNextStepKey(definition, step, snapshot.output);
    }

    const finishedAt = new Date();

    return {
      output: {
        workflow: {
          id: input.workflow.id,
          publicId: input.workflow.publicId,
          version: input.workflow.version,
        },
        trigger: executionInput.trigger,
        status: 'succeeded',
        startedAt: input.startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
        stepCount: snapshots.length,
        steps: snapshots,
      },
    };
  }

  private async executeStep(
    step: WorkflowStepDefinitionValue,
    context: StepExecutionContext,
  ): Promise<ExecutedStepSnapshot> {
    const startedAt = new Date();
    const output = await runStep(step, context);
    const finishedAt = new Date();

    return {
      key: step.key,
      name: step.name,
      type: step.type,
      status: 'succeeded',
      output,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    };
  }
}

async function runStep(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
): Promise<JsonObject> {
  if (step.type === 'condition') {
    return runConditionStep(step, context);
  }

  throw executionStepRunnerMissing(step.key, step.type);
}

function runConditionStep(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
): JsonObject {
  const branch = readOptionalString(step.config.branch);
  const pass = readOptionalBoolean(step.config.pass);
  const selectedBranch = branch ?? (pass === false ? 'failure' : 'success');

  return {
    result: pass === false ? 'failed_condition' : 'passed_condition',
    branch: selectedBranch,
    triggerType: context.input.trigger.type,
    previousStepCount: context.previousSteps.length,
  };
}

function resolveNextStepKey(
  definition: WorkflowDefinition,
  step: WorkflowStepDefinitionValue,
  output: JsonObject,
): string | undefined {
  const branch = typeof output.branch === 'string' ? output.branch : null;
  const branchTarget = branch ? step.transitions?.branches?.[branch] : undefined;

  if (branchTarget) {
    return branchTarget;
  }

  if (step.transitions?.onSuccess) {
    return step.transitions.onSuccess;
  }

  const currentIndex = definition.steps.findIndex((candidate) => candidate.key === step.key);
  const nextStep = currentIndex >= 0 ? definition.steps[currentIndex + 1] : undefined;

  return nextStep?.key;
}

function readOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw invalidConditionConfig('Condition step branch must be a string');
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > 80) {
    throw invalidConditionConfig('Condition step branch is invalid');
  }

  return normalizedValue;
}

function readOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw invalidConditionConfig('Condition step pass flag must be a boolean');
  }

  return value;
}

function invalidConditionConfig(message: string): DomainError {
  return new DomainError({
    code: 'EXECUTION_CONDITION_STEP_CONFIG_INVALID',
    category: 'validation',
    message,
  });
}
