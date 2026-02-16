import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ExecuteAutomationWorkflowUseCase,
  GetAutomationWorkflowContractUseCase,
} from '@runlane/application';
import type {
  AutomationBridgeContractResponseDto,
  AutomationBridgeExecutionAcceptedDto,
} from '@runlane/contracts';
import { ApiKeyGuard, readApiKeyScope } from '@runlane/infrastructure';
import type { ApiKeyScopedHttpRequest } from '@runlane/infrastructure';

type OpenApiSchemaObject = {
  readonly type?: string;
  readonly format?: string;
  readonly example?: unknown;
  readonly required?: string[];
  readonly enum?: unknown[];
  readonly properties?: Record<string, OpenApiSchemaObject>;
  readonly items?: OpenApiSchemaObject;
  readonly nullable?: boolean;
  readonly additionalProperties?: boolean | OpenApiSchemaObject;
};

const automationPayloadSchema = {
  type: 'object',
  required: ['payload'],
  properties: {
    payload: {
      type: 'object',
      additionalProperties: true,
      example: {
        leadId: 'lead_1029',
        email: 'ada@example.com',
        company: 'Analytical Engines',
        score: 82,
      },
    },
    source: { type: 'string', example: 'n8n' },
    idempotencyKey: { type: 'string', example: 'automation-lead-1029' },
    metadata: {
      type: 'object',
      additionalProperties: true,
      example: {
        scenarioId: 'n8n-workflow-18',
        caller: 'lead-intake',
      },
    },
  },
  additionalProperties: false,
} satisfies OpenApiSchemaObject;

const automationContractSchema = {
  type: 'object',
  required: ['contract'],
  properties: {
    contract: {
      type: 'object',
      required: [
        'mode',
        'workflowId',
        'workflowPublicId',
        'workspaceId',
        'workflowVersion',
        'triggerType',
        'workflowStatus',
        'entryStepKey',
        'stepCount',
        'request',
        'response',
      ],
      properties: {
        mode: { type: 'string', enum: ['automation_bridge'] },
        workflowId: { type: 'string', format: 'uuid' },
        workflowPublicId: { type: 'string', example: 'wf_0123456789abcdef0123456789abcdef' },
        workspaceId: { type: 'string', format: 'uuid' },
        workflowVersion: { type: 'integer' },
        triggerType: { type: 'string', example: 'automation' },
        workflowStatus: { type: 'string', enum: ['draft', 'published', 'archived'] },
        entryStepKey: { type: 'string', example: 'qualify_lead' },
        stepCount: { type: 'integer' },
        request: {
          type: 'object',
          additionalProperties: true,
        },
        response: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  },
} satisfies OpenApiSchemaObject;

const automationAcceptedSchema = {
  type: 'object',
  required: ['automationRequest'],
  properties: {
    automationRequest: {
      type: 'object',
      required: [
        'id',
        'workspaceId',
        'workflowId',
        'workflowPublicId',
        'workflowVersion',
        'status',
        'source',
        'idempotencyKey',
        'payloadHash',
        'acceptedAt',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        workspaceId: { type: 'string', format: 'uuid' },
        workflowId: { type: 'string', format: 'uuid' },
        workflowPublicId: { type: 'string', example: 'wf_0123456789abcdef0123456789abcdef' },
        workflowVersion: { type: 'integer' },
        status: { type: 'string', enum: ['accepted'] },
        source: { type: 'string', example: 'n8n' },
        idempotencyKey: { type: 'string', nullable: true, example: 'automation-lead-1029' },
        payloadHash: { type: 'string', example: 'f'.repeat(64) },
        acceptedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Automation Bridge')
@ApiHeader({
  name: 'X-Runlane-Api-Key',
  required: false,
  description: 'API key token. ApiKey authorization is also supported.',
})
@ApiUnauthorizedResponse({ description: 'A valid API key is required' })
@ApiNotFoundResponse({ description: 'Automation workflow was not found' })
@ApiConflictResponse({ description: 'Workflow is not configured for automation bridge execution' })
@UseGuards(ApiKeyGuard)
@Controller({ path: 'automation', version: '1' })
export class AutomationController {
  constructor(
    @Inject(GetAutomationWorkflowContractUseCase)
    private readonly getAutomationContract: GetAutomationWorkflowContractUseCase,
    @Inject(ExecuteAutomationWorkflowUseCase)
    private readonly executeAutomationWorkflow: ExecuteAutomationWorkflowUseCase,
  ) {}

  @Get('contracts/:workflowPublicId')
  @ApiOperation({
    operationId: 'getAutomationWorkflowContract',
    summary: 'Read an API-key-protected automation bridge contract',
  })
  @ApiParam({
    name: 'workflowPublicId',
    schema: { type: 'string', example: 'wf_0123456789abcdef0123456789abcdef' },
  })
  @ApiOkResponse({ schema: automationContractSchema })
  contract(
    @Req() request: ApiKeyScopedHttpRequest,
    @Param('workflowPublicId') workflowPublicId: string,
  ): Promise<AutomationBridgeContractResponseDto> {
    return this.getAutomationContract.execute({
      scope: readApiKeyScope(request),
      workflowPublicId,
    });
  }

  @Post('execute/:workflowPublicId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    operationId: 'executeAutomationWorkflow',
    summary: 'Accept an API-key-protected automation bridge payload',
  })
  @ApiParam({
    name: 'workflowPublicId',
    schema: { type: 'string', example: 'wf_0123456789abcdef0123456789abcdef' },
  })
  @ApiHeader({
    name: 'X-Runlane-Source',
    required: false,
    schema: { type: 'string', example: 'n8n' },
  })
  @ApiHeader({
    name: 'X-Runlane-Idempotency-Key',
    required: false,
    schema: { type: 'string', example: 'automation-lead-1029' },
  })
  @ApiBody({ schema: automationPayloadSchema })
  @ApiAcceptedResponse({ schema: automationAcceptedSchema })
  execute(
    @Req() request: AutomationHttpRequest,
    @Param('workflowPublicId') workflowPublicId: string,
    @Body() body: unknown,
  ): Promise<AutomationBridgeExecutionAcceptedDto> {
    return this.executeAutomationWorkflow.execute({
      scope: readApiKeyScope(request),
      workflowPublicId,
      body,
      source: readHeader(request, 'x-runlane-source', 80),
      idempotencyKey: readHeader(request, 'x-runlane-idempotency-key', 160),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }
}

type AutomationHttpRequest = ApiKeyScopedHttpRequest & {
  readonly ip?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
};

function readHeader(
  request: AutomationHttpRequest,
  name: string,
  maximumLength: number,
): string | null {
  const value = request.headers[name];
  const headerValue = Array.isArray(value) ? value[0] : value;

  if (!headerValue) {
    return null;
  }

  return headerValue.slice(0, maximumLength);
}

function readClientIp(request: AutomationHttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}
