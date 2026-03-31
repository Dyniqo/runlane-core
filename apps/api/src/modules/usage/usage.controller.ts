import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GetCurrentUsageUseCase } from '@runlane/application';
import type { CurrentUsageResponseDto } from '@runlane/contracts';
import { readWorkspaceScope, WorkspaceTenantGuard } from '@runlane/infrastructure';
import type { WorkspaceScopedHttpRequest } from '@runlane/infrastructure';

type OpenApiSchemaObject = {
  readonly type?: string;
  readonly format?: string;
  readonly example?: unknown;
  readonly minimum?: number;
  readonly required?: string[];
  readonly enum?: unknown[];
  readonly properties?: Record<string, OpenApiSchemaObject>;
  readonly items?: OpenApiSchemaObject;
};

const usageMetricSchema = {
  type: 'object',
  required: ['type', 'quantity'],
  properties: {
    type: {
      type: 'string',
      enum: ['execution', 'ai_call', 'http_call', 'webhook_request', 'retry'],
    },
    quantity: { type: 'integer', minimum: 0 },
  },
} satisfies OpenApiSchemaObject;

const currentUsageResponseSchema = {
  type: 'object',
  required: ['workspaceId', 'periodStart', 'periodEnd', 'totals', 'metrics'],
  properties: {
    workspaceId: { type: 'string', format: 'uuid' },
    periodStart: { type: 'string', format: 'date-time' },
    periodEnd: { type: 'string', format: 'date-time' },
    totals: {
      type: 'object',
      required: ['executions', 'aiCalls', 'httpCalls', 'webhookRequests', 'retries'],
      properties: {
        executions: { type: 'integer', minimum: 0 },
        aiCalls: { type: 'integer', minimum: 0 },
        httpCalls: { type: 'integer', minimum: 0 },
        webhookRequests: { type: 'integer', minimum: 0 },
        retries: { type: 'integer', minimum: 0 },
      },
    },
    metrics: { type: 'array', items: usageMetricSchema },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Usage')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Workspace access is denied' })
@UseGuards(WorkspaceTenantGuard)
@Controller({ path: 'usage', version: '1' })
export class UsageController {
  constructor(
    @Inject(GetCurrentUsageUseCase) private readonly getCurrentUsage: GetCurrentUsageUseCase,
  ) {}

  @Get('current')
  @ApiOperation({ operationId: 'getCurrentUsage', summary: 'Get current workspace usage' })
  @ApiOkResponse({ schema: currentUsageResponseSchema })
  current(@Req() request: WorkspaceScopedHttpRequest): Promise<CurrentUsageResponseDto> {
    return this.getCurrentUsage.execute({ scope: readWorkspaceScope(request) });
  }
}
