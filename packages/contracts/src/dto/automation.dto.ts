import type { JsonValue } from '../shared';
import type { WorkflowStatusDto } from './workflow.dto';

export type AutomationBridgeContractModeDto = 'automation_bridge';
export type AutomationBridgeRequestStatusDto = 'accepted';

export interface AutomationBridgeContractDto {
  readonly mode: AutomationBridgeContractModeDto;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workspaceId: string;
  readonly workflowVersion: number;
  readonly triggerType: string;
  readonly workflowStatus: WorkflowStatusDto;
  readonly entryStepKey: string;
  readonly stepCount: number;
  readonly request: AutomationBridgeRequestContractDto;
  readonly response: AutomationBridgeResponseContractDto;
}

export interface AutomationBridgeRequestContractDto {
  readonly method: 'POST';
  readonly path: string;
  readonly authentication: 'api_key';
  readonly headers: readonly AutomationBridgeHeaderContractDto[];
  readonly body: AutomationBridgeBodyContractDto;
}

export interface AutomationBridgeHeaderContractDto {
  readonly name: string;
  readonly required: boolean;
  readonly description: string;
}

export interface AutomationBridgeBodyContractDto {
  readonly type: 'object';
  readonly required: readonly string[];
  readonly properties: readonly AutomationBridgeBodyPropertyContractDto[];
}

export interface AutomationBridgeBodyPropertyContractDto {
  readonly name: string;
  readonly required: boolean;
  readonly description: string;
}

export interface AutomationBridgeResponseContractDto {
  readonly statusCode: 202;
  readonly body: AutomationBridgeResponseBodyContractDto;
}

export interface AutomationBridgeResponseBodyContractDto {
  readonly type: 'object';
  readonly required: readonly string[];
}

export interface AutomationBridgeContractResponseDto {
  readonly contract: AutomationBridgeContractDto;
}

export interface AutomationBridgeExecutionRequestDto {
  readonly payload?: JsonValue;
  readonly source?: string;
  readonly idempotencyKey?: string;
  readonly metadata?: JsonValue;
}

export interface AutomationBridgeRequestDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly status: AutomationBridgeRequestStatusDto;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly payloadHash: string;
  readonly acceptedAt: string;
}

export interface AutomationBridgeExecutionAcceptedDto {
  readonly automationRequest: AutomationBridgeRequestDto;
}
