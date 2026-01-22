import type { JsonObject } from '../shared';

export const WORKFLOW_SCHEMA_VERSION = 1 as const;
export const WORKFLOW_TRIGGER_TYPES = ['webhook', 'automation', 'manual'] as const;
export const WORKFLOW_STEP_TYPES = ['http', 'ai_decision', 'notification', 'condition'] as const;

export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];
export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];

export interface WorkflowTriggerDefinition {
  readonly type: WorkflowTriggerType;
  readonly config: JsonObject;
}

export interface WorkflowStepTransitions {
  readonly onSuccess?: string;
  readonly onFailure?: string;
  readonly branches?: Readonly<Record<string, string>>;
}

export interface WorkflowStepDefinition {
  readonly key: string;
  readonly name: string;
  readonly type: WorkflowStepType;
  readonly config: JsonObject;
  readonly timeoutMs?: number;
  readonly transitions?: WorkflowStepTransitions;
}

export interface WorkflowDefinition {
  readonly schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  readonly trigger: WorkflowTriggerDefinition;
  readonly entryStepKey: string;
  readonly steps: readonly WorkflowStepDefinition[];
}
