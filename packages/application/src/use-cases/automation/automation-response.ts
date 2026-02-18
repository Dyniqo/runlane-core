import type {
  AutomationBridgeContractDto,
  AutomationBridgeExecutionAcceptedDto,
  JsonValue,
} from '@runlane/contracts';
import { readWorkflowDefinition } from '@runlane/domain';
import type {
  StoredAuditLogRecord,
  StoredExecutionRecord,
  StoredWorkflowRecord,
} from '../../ports';
import { buildExecutionResponse } from '../execution';

export function buildAutomationBridgeContract(
  workflow: StoredWorkflowRecord,
): AutomationBridgeContractDto {
  const definition = readWorkflowDefinition(workflow.definition, {
    triggerType: workflow.triggerType,
  });

  return {
    mode: 'automation_bridge',
    workflowId: workflow.id,
    workflowPublicId: workflow.publicId,
    workspaceId: workflow.workspaceId,
    workflowVersion: workflow.version,
    triggerType: workflow.triggerType,
    workflowStatus: workflow.status,
    entryStepKey: definition.entryStepKey,
    stepCount: definition.steps.length,
    request: {
      method: 'POST',
      path: `/v1/automation/execute/${workflow.publicId}`,
      authentication: 'api_key',
      headers: [
        {
          name: 'X-Runlane-Api-Key',
          required: true,
          description: 'API key token for the workflow workspace',
        },
        {
          name: 'X-Runlane-Source',
          required: false,
          description: 'External automation source identifier',
        },
        {
          name: 'X-Runlane-Idempotency-Key',
          required: false,
          description: 'Caller-provided idempotency key for downstream execution creation',
        },
      ],
      body: {
        type: 'object',
        required: ['payload'],
        properties: [
          {
            name: 'payload',
            required: true,
            description: 'Normalized JSON object forwarded into the workflow execution input',
          },
          {
            name: 'source',
            required: false,
            description: 'External automation source identifier, overriding the source header',
          },
          {
            name: 'idempotencyKey',
            required: false,
            description: 'Caller-provided idempotency key, overriding the idempotency header',
          },
          {
            name: 'metadata',
            required: false,
            description: 'Additional caller metadata stored for observability and audit',
          },
        ],
      },
    },
    response: {
      statusCode: 202,
      body: {
        type: 'object',
        required: ['automationRequest', 'execution'],
      },
    },
  };
}

export function buildAutomationBridgeAcceptedResponse(input: {
  readonly workflow: StoredWorkflowRecord;
  readonly auditLog: StoredAuditLogRecord;
  readonly execution: StoredExecutionRecord;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly payloadHash: string;
}): AutomationBridgeExecutionAcceptedDto {
  return {
    automationRequest: {
      id: input.auditLog.id,
      workspaceId: input.workflow.workspaceId,
      workflowId: input.workflow.id,
      workflowPublicId: input.workflow.publicId,
      workflowVersion: input.workflow.version,
      status: 'accepted',
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.payloadHash,
      acceptedAt: input.auditLog.createdAt.toISOString(),
    },
    execution: buildExecutionResponse(input.execution, input.workflow),
  };
}

export function readAutomationJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}
