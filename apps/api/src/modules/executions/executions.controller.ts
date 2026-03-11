import { Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  GetExecutionUseCase,
  invalidExecutionQuery,
  ListExecutionsUseCase,
  ListExecutionStepsUseCase,
  RetryExecutionUseCase,
} from '@runlane/application';
import type {
  ExecutionResponseDto,
  ExecutionStepsResponseDto,
  ListExecutionsResponseDto,
} from '@runlane/contracts';
import { readWorkspaceScope, WorkspaceTenantGuard } from '@runlane/infrastructure';
import type { WorkspaceScopedHttpRequest } from '@runlane/infrastructure';

type OpenApiSchemaObject = {
  readonly type?: string;
  readonly format?: string;
  readonly example?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly required?: string[];
  readonly enum?: unknown[];
  readonly properties?: Record<string, OpenApiSchemaObject>;
  readonly items?: OpenApiSchemaObject;
  readonly nullable?: boolean;
  readonly additionalProperties?: boolean | OpenApiSchemaObject;
};

interface ExecutionsHttpRequest extends WorkspaceScopedHttpRequest {
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
}

const executionSchema = {
  type: 'object',
  required: [
    'id',
    'workspaceId',
    'workflowId',
    'workflowPublicId',
    'workflowVersion',
    'status',
    'attempts',
    'input',
    'output',
    'errorCode',
    'errorMessage',
    'durationMs',
    'queuedAt',
    'startedAt',
    'finishedAt',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    workspaceId: { type: 'string', format: 'uuid' },
    workflowId: { type: 'string', format: 'uuid' },
    workflowPublicId: { type: 'string', example: 'wf_0123456789abcdef0123456789abcdef' },
    workflowVersion: { type: 'integer' },
    status: {
      type: 'string',
      enum: ['queued', 'running', 'succeeded', 'failed', 'retrying', 'dead_letter', 'cancelled'],
    },
    attempts: { type: 'integer', minimum: 0 },
    input: { type: 'object', additionalProperties: true },
    output: { type: 'object', additionalProperties: true, nullable: true },
    errorCode: { type: 'string', nullable: true },
    errorMessage: { type: 'string', nullable: true },
    durationMs: { type: 'integer', nullable: true, minimum: 0 },
    queuedAt: { type: 'string', format: 'date-time' },
    startedAt: { type: 'string', format: 'date-time', nullable: true },
    finishedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const executionStepSchema = {
  type: 'object',
  required: [
    'id',
    'workspaceId',
    'executionId',
    'stepKey',
    'type',
    'status',
    'input',
    'output',
    'errorCode',
    'errorMessage',
    'durationMs',
    'startedAt',
    'finishedAt',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    workspaceId: { type: 'string', format: 'uuid' },
    executionId: { type: 'string', format: 'uuid' },
    stepKey: { type: 'string', example: 'qualify_lead' },
    type: { type: 'string', enum: ['http', 'ai_decision', 'notification', 'condition'] },
    status: { type: 'string', enum: ['running', 'succeeded', 'failed'] },
    input: { type: 'object', additionalProperties: true },
    output: { type: 'object', additionalProperties: true, nullable: true },
    errorCode: { type: 'string', nullable: true },
    errorMessage: { type: 'string', nullable: true },
    durationMs: { type: 'integer', nullable: true, minimum: 0 },
    startedAt: { type: 'string', format: 'date-time' },
    finishedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const executionResponseSchema = {
  type: 'object',
  required: ['execution'],
  properties: {
    execution: executionSchema,
  },
} satisfies OpenApiSchemaObject;

const listExecutionsResponseSchema = {
  type: 'object',
  required: ['items', 'nextCursor', 'hasMore'],
  properties: {
    items: { type: 'array', items: executionSchema },
    nextCursor: { type: 'string', format: 'date-time', nullable: true },
    hasMore: { type: 'boolean' },
  },
} satisfies OpenApiSchemaObject;

const executionStepsResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: { type: 'array', items: executionStepSchema },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Workspace access is denied' })
@UseGuards(WorkspaceTenantGuard)
@Controller({ path: 'executions', version: '1' })
export class ExecutionsController {
  constructor(
    @Inject(ListExecutionsUseCase) private readonly listExecutions: ListExecutionsUseCase,
    @Inject(GetExecutionUseCase) private readonly getExecution: GetExecutionUseCase,
    @Inject(ListExecutionStepsUseCase)
    private readonly listExecutionSteps: ListExecutionStepsUseCase,
    @Inject(RetryExecutionUseCase) private readonly retryExecution: RetryExecutionUseCase,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listExecutions',
    summary: 'List executions for the current workspace',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiOkResponse({ schema: listExecutionsResponseSchema })
  list(
    @Req() request: WorkspaceScopedHttpRequest,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<ListExecutionsResponseDto> {
    return this.listExecutions.execute({
      scope: readWorkspaceScope(request),
      cursor: parseCursor(cursor),
      limit: parseLimit(limit),
    });
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getExecution', summary: 'Get an execution by id' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: executionResponseSchema })
  get(
    @Req() request: WorkspaceScopedHttpRequest,
    @Param('id') executionId: string,
  ): Promise<ExecutionResponseDto> {
    return this.getExecution.execute({
      scope: readWorkspaceScope(request),
      executionId: parseExecutionId(executionId),
    });
  }

  @Get(':id/steps')
  @ApiOperation({ operationId: 'listExecutionSteps', summary: 'List persisted execution steps' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: executionStepsResponseSchema })
  steps(
    @Req() request: WorkspaceScopedHttpRequest,
    @Param('id') executionId: string,
  ): Promise<ExecutionStepsResponseDto> {
    return this.listExecutionSteps.execute({
      scope: readWorkspaceScope(request),
      executionId: parseExecutionId(executionId),
    });
  }

  @Post(':id/retry')
  @ApiOperation({ operationId: 'retryExecution', summary: 'Retry a dead-lettered execution' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: executionResponseSchema })
  retry(
    @Req() request: ExecutionsHttpRequest,
    @Param('id') executionId: string,
  ): Promise<ExecutionResponseDto> {
    const scope = readWorkspaceScope(request);

    return this.retryExecution.execute({
      scope,
      executionId: parseExecutionId(executionId),
      actorUserId: scope.userId,
      ip: readClientIp(request),
      userAgent: readHeader(request, 'user-agent', 512),
    });
  }
}

function parseCursor(cursor: string | undefined): string | null {
  if (cursor === undefined || cursor.length === 0) {
    return null;
  }

  const date = new Date(cursor);

  if (Number.isNaN(date.getTime())) {
    throw invalidExecutionQuery('Execution cursor must be a valid ISO date-time');
  }

  return date.toISOString();
}

function parseLimit(limit: string | undefined): number | null {
  if (limit === undefined || limit.length === 0) {
    return null;
  }

  const parsedLimit = Number.parseInt(limit, 10);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw invalidExecutionQuery('Execution limit must be an integer between 1 and 100');
  }

  return parsedLimit;
}

function parseExecutionId(executionId: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(executionId)
  ) {
    throw invalidExecutionQuery('Execution id must be a valid UUID');
  }

  return executionId;
}

function readHeader(
  request: { readonly headers: Readonly<Record<string, string | readonly string[] | undefined>> },
  name: string,
  maxLength: number,
): string | null {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  const rawValue = Array.isArray(value) ? value.find((item) => item.length > 0) : value;

  if (!rawValue) {
    return null;
  }

  return rawValue.slice(0, maxLength);
}

function readClientIp(request: ExecutionsHttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}
