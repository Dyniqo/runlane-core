import type {
  AiProviderStructuredResponseError,
  ConnectorExecutionError,
  JsonObject,
  JsonValue,
} from '@runlane/contracts';
import {
  DomainError,
  executionStepCycleDetected,
  executionStepRunnerMissing,
  executionStepTargetMissing,
  executionStepTimedOut,
  isDomainError,
  readAiDecisionStepConfig,
  readExecutionInput,
  readWorkflowDefinition,
} from '@runlane/domain';
import type {
  ExecutionInputEnvelope,
  WorkflowDefinition,
  WorkflowStepDefinitionValue,
} from '@runlane/domain';
import type {
  AiProviderPort,
  ExecutionStepRepositoryPort,
  HttpConnectorPort,
  SecretCipherPort,
  StoredExecutionRecord,
  StoredWorkflowRecord,
  WorkflowSecretRepositoryPort,
} from '../../ports';
import type { SafeTemplateResolutionResult, SafeTemplateResolver } from './safe-template-resolver';
import { resolveWorkflowSecretReferences } from '../secrets';

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
  readonly secrets: ReadonlyMap<string, string>;
  readonly httpConnector: HttpConnectorPort;
  readonly aiProvider: AiProviderPort;
}

interface NextStepResolution {
  readonly stepKey?: string;
  readonly selectedByTransition: boolean;
}

const DEFAULT_STEP_TIMEOUT_MS = 30_000;

export class WorkflowExecutionEngine {
  constructor(
    private readonly steps: ExecutionStepRepositoryPort,
    private readonly templates: SafeTemplateResolver,
    private readonly secrets: WorkflowSecretRepositoryPort,
    private readonly cipher: SecretCipherPort,
    private readonly httpConnector: HttpConnectorPort,
    private readonly aiProvider: AiProviderPort,
  ) {}

  async execute(input: WorkflowExecutionEngineInput): Promise<WorkflowExecutionEngineResult> {
    const definition = readWorkflowDefinition(input.workflow.definition, {
      triggerType: input.workflow.triggerType,
    });
    const executionInput = readExecutionInput(input.execution.input);
    const stepMap = new Map(definition.steps.map((step) => [step.key, step]));
    const snapshots: ExecutedStepSnapshot[] = [];
    const visitedSteps = new Set<string>();
    let currentStepKey: string | undefined = definition.entryStepKey;
    let currentStepSelectedByTransition = false;

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
        secrets: new Map(),
        httpConnector: this.httpConnector,
        aiProvider: this.aiProvider,
      });

      snapshots.push(snapshot);
      const nextStep = resolveNextStep(
        definition,
        step,
        snapshot.output,
        currentStepSelectedByTransition,
      );
      currentStepKey = nextStep.stepKey;
      currentStepSelectedByTransition = nextStep.selectedByTransition;
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
    const resolvedConfig = this.templates.resolveObject(step.config as JsonObject, {
      payload: context.input.payload,
      steps: buildPreviousStepOutputIndex(context.previousSteps),
    });
    const resolvedSecrets = await resolveWorkflowSecretReferences({
      workspaceId: context.execution.workspaceId,
      workflowId: context.workflow.id,
      references: resolvedConfig.secretReferences,
      secrets: this.secrets,
      cipher: this.cipher,
    });
    const stepInput = buildStepInput(step, context, resolvedConfig);
    const executableStep: WorkflowStepDefinitionValue = {
      ...step,
      config: resolvedConfig.value as unknown as WorkflowStepDefinitionValue['config'],
    };
    const stepContext: StepExecutionContext = {
      ...context,
      secrets: resolvedSecrets,
    };

    await this.steps.createRunning({
      workspaceId: context.execution.workspaceId,
      executionId: context.execution.id,
      stepKey: step.key,
      type: step.type,
      input: stepInput,
      startedAt,
    });

    try {
      const output = await runWithTimeout(executableStep, stepContext);
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      await this.steps.markSucceeded({
        workspaceId: context.execution.workspaceId,
        executionId: context.execution.id,
        stepKey: step.key,
        output,
        finishedAt,
        durationMs,
      });

      return {
        key: step.key,
        name: step.name,
        type: step.type,
        status: 'succeeded',
        output,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
      };
    } catch (error) {
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      await this.steps.markFailed({
        workspaceId: context.execution.workspaceId,
        executionId: context.execution.id,
        stepKey: step.key,
        errorCode: resolveStepErrorCode(error),
        errorMessage: resolveStepErrorMessage(error),
        finishedAt,
        durationMs,
      });
      throw error;
    }
  }
}

async function runWithTimeout(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
): Promise<JsonObject> {
  const timeoutMs = step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      runStep(step, context),
      new Promise<JsonObject>((_, reject) => {
        timeout = setTimeout(() => reject(executionStepTimedOut(step.key, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function runStep(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
): Promise<JsonObject> {
  if (step.type === 'condition') {
    return runConditionStep(step, context);
  }

  if (step.type === 'http') {
    return runHttpStep(step, context);
  }

  if (step.type === 'ai_decision') {
    return runAiDecisionStep(step, context);
  }

  throw executionStepRunnerMissing(step.key, step.type);
}

async function runHttpStep(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
): Promise<JsonObject> {
  const result = await context.httpConnector.execute({
    context: {
      workspaceId: context.execution.workspaceId,
      workflowId: context.workflow.id,
      executionId: context.execution.id,
      stepKey: step.key,
      attempt: context.execution.attempts,
      correlationId: context.execution.id,
    },
    config: step.config as JsonObject,
    secrets: context.secrets,
  });

  if (result.status === 'succeeded') {
    return result.output as JsonObject;
  }

  throw connectorExecutionFailed(result.error);
}

async function runAiDecisionStep(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
): Promise<JsonObject> {
  const config = readAiDecisionStepConfig(step.config);
  const result = await context.aiProvider.generateStructuredResponse({
    workspaceId: context.execution.workspaceId,
    workflowId: context.workflow.id,
    executionId: context.execution.id,
    stepKey: step.key,
    correlationId: context.execution.id,
    messages: config.messages,
    schema: config.schema,
    ...(config.model ? { model: config.model } : {}),
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxOutputTokens !== undefined ? { maxOutputTokens: config.maxOutputTokens } : {}),
    timeoutMs: step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
  });

  if (result.status === 'failed') {
    throw aiProviderExecutionFailed(result.error);
  }

  const branch = readOptionalBranch(result.output, config.branchPath);

  return {
    decision: result.output,
    ...(branch ? { branch } : {}),
    provider: {
      model: result.model,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    },
  };
}

async function runConditionStep(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
): Promise<JsonObject> {
  const delayMs = readOptionalDelayMs(step.config.delayMs);

  if (delayMs > 0) {
    await delay(delayMs);
  }

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

function readOptionalDelayMs(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }

  if (!Number.isInteger(value) || typeof value !== 'number' || value < 0 || value > 300_000) {
    return 0;
  }

  return value;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function buildStepInput(
  step: WorkflowStepDefinitionValue,
  context: StepExecutionContext,
  resolvedConfig: SafeTemplateResolutionResult,
): JsonObject {
  return {
    step: {
      key: step.key,
      name: step.name,
      type: step.type,
      config: resolvedConfig.value,
      secretReferences: resolvedConfig.secretReferences.map((reference) => ({
        key: reference.key,
        path: reference.path,
      })),
      timeoutMs: step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    },
    workflow: {
      id: context.workflow.id,
      publicId: context.workflow.publicId,
      version: context.workflow.version,
    },
    trigger: context.input.trigger,
    payload: context.input.payload,
    previousSteps: context.previousSteps.map((previousStep) => ({
      key: previousStep.key,
      status: previousStep.status,
      output: previousStep.output,
    })),
  };
}

function buildPreviousStepOutputIndex(
  previousSteps: readonly ExecutedStepSnapshot[],
): Readonly<Record<string, { readonly output: JsonObject }>> {
  return Object.fromEntries(
    previousSteps.map((previousStep) => [previousStep.key, { output: previousStep.output }]),
  );
}

function resolveNextStep(
  definition: WorkflowDefinition,
  step: WorkflowStepDefinitionValue,
  output: JsonObject,
  currentStepSelectedByTransition: boolean,
): NextStepResolution {
  const branch = typeof output.branch === 'string' ? output.branch : null;
  const branchTarget = branch ? step.transitions?.branches?.[branch] : undefined;

  if (branchTarget) {
    return {
      stepKey: branchTarget,
      selectedByTransition: true,
    };
  }

  if (step.transitions?.onSuccess) {
    return {
      stepKey: step.transitions.onSuccess,
      selectedByTransition: true,
    };
  }

  if (currentStepSelectedByTransition) {
    return {
      selectedByTransition: false,
    };
  }

  const currentIndex = definition.steps.findIndex((candidate) => candidate.key === step.key);
  const nextStep = currentIndex >= 0 ? definition.steps[currentIndex + 1] : undefined;

  if (!nextStep) {
    return {
      selectedByTransition: false,
    };
  }

  return {
    stepKey: nextStep.key,
    selectedByTransition: false,
  };
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

function readOptionalBranch(source: JsonObject, path: string): string | null {
  const value = readJsonPathValue(source, path);

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new DomainError({
      code: 'AI_DECISION_BRANCH_INVALID',
      category: 'validation',
      message: 'AI decision branch output must be a string',
    });
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > 80) {
    throw new DomainError({
      code: 'AI_DECISION_BRANCH_INVALID',
      category: 'validation',
      message: 'AI decision branch output is invalid',
    });
  }

  return normalizedValue;
}

function readJsonPathValue(source: JsonObject, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = source;

  for (const segment of path.split('.')) {
    if (!isJsonObject(current) || Array.isArray(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function resolveStepErrorCode(error: unknown): string {
  if (isDomainError(error)) {
    return error.code;
  }

  return 'EXECUTION_STEP_FAILED';
}

function resolveStepErrorMessage(error: unknown): string {
  if (isDomainError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Execution step failed';
}

function connectorExecutionFailed(error: ConnectorExecutionError): DomainError {
  return new DomainError({
    code: error.code,
    category: mapConnectorErrorCategory(error),
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}

function aiProviderExecutionFailed(error: AiProviderStructuredResponseError): DomainError {
  return new DomainError({
    code: error.code,
    category: mapAiProviderErrorCategory(error),
    message: error.message,
    details: {
      ...(error.details ?? {}),
      retryable: error.retryable,
    },
  });
}

function mapConnectorErrorCategory(error: ConnectorExecutionError): DomainError['category'] {
  if (
    error.category === 'authentication' ||
    error.category === 'authorization' ||
    error.category === 'rate_limit'
  ) {
    return error.category;
  }

  return error.retryable ? 'business_rule' : 'validation';
}

function mapAiProviderErrorCategory(
  error: AiProviderStructuredResponseError,
): DomainError['category'] {
  if (
    error.category === 'authentication' ||
    error.category === 'authorization' ||
    error.category === 'rate_limit'
  ) {
    return error.category;
  }

  return error.retryable ? 'business_rule' : 'validation';
}

function invalidConditionConfig(message: string): DomainError {
  return new DomainError({
    code: 'EXECUTION_CONDITION_STEP_CONFIG_INVALID',
    category: 'validation',
    message,
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}
