import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CreateWorkflowUseCase,
  GetWorkflowUseCase,
  ListWorkflowsUseCase,
  UpdateWorkflowUseCase,
} from '@runlane/application';
import type { ListWorkflowsResponseDto, WorkflowResponseDto } from '@runlane/contracts';
import { DomainError } from '@runlane/domain';
import { readWorkspaceScope, WorkspaceTenantGuard } from '@runlane/infrastructure';
import type { WorkspaceScopedHttpRequest } from '@runlane/infrastructure';

type OpenApiSchemaObject = {
  readonly type?: string;
  readonly format?: string;
  readonly example?: unknown;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly required?: string[];
  readonly enum?: unknown[];
  readonly properties?: Record<string, OpenApiSchemaObject>;
  readonly items?: OpenApiSchemaObject;
  readonly nullable?: boolean;
  readonly additionalProperties?: boolean | OpenApiSchemaObject;
};

const workflowDefinitionSchema = {
  type: 'object',
  additionalProperties: true,
  example: {
    steps: [],
  },
} satisfies OpenApiSchemaObject;

const workflowSchema = {
  type: 'object',
  required: [
    'id',
    'workspaceId',
    'name',
    'status',
    'version',
    'triggerType',
    'definition',
    'publishedAt',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    workspaceId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    version: { type: 'integer' },
    triggerType: { type: 'string', example: 'webhook' },
    definition: workflowDefinitionSchema,
    publishedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const workflowResponseSchema = {
  type: 'object',
  required: ['workflow'],
  properties: {
    workflow: workflowSchema,
  },
} satisfies OpenApiSchemaObject;

const listWorkflowsResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: workflowSchema,
    },
  },
} satisfies OpenApiSchemaObject;

const createWorkflowRequestSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 140, example: 'AI lead routing' },
    triggerType: { type: 'string', example: 'webhook' },
    definition: workflowDefinitionSchema,
  },
} satisfies OpenApiSchemaObject;

const updateWorkflowRequestSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 140, example: 'Qualified lead routing' },
    triggerType: { type: 'string', example: 'webhook' },
    definition: workflowDefinitionSchema,
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Workflows')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Workspace access is denied' })
@UseGuards(WorkspaceTenantGuard)
@Controller({ path: 'workflows', version: '1' })
export class WorkflowsController {
  constructor(
    @Inject(CreateWorkflowUseCase) private readonly createWorkflow: CreateWorkflowUseCase,
    @Inject(ListWorkflowsUseCase) private readonly listWorkflows: ListWorkflowsUseCase,
    @Inject(GetWorkflowUseCase) private readonly getWorkflow: GetWorkflowUseCase,
    @Inject(UpdateWorkflowUseCase) private readonly updateWorkflow: UpdateWorkflowUseCase,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listWorkflows',
    summary: 'List workflows for the current workspace',
  })
  @ApiOkResponse({ schema: listWorkflowsResponseSchema })
  list(@Req() request: WorkspaceScopedHttpRequest): Promise<ListWorkflowsResponseDto> {
    return this.listWorkflows.execute({ scope: readWorkspaceScope(request) });
  }

  @Post()
  @ApiOperation({ operationId: 'createWorkflow', summary: 'Create a workflow draft' })
  @ApiBody({ schema: createWorkflowRequestSchema })
  @ApiCreatedResponse({ schema: workflowResponseSchema })
  create(@Req() request: WorkflowHttpRequest, @Body() body: unknown): Promise<WorkflowResponseDto> {
    const payload = parseCreateWorkflowRequest(body);

    return this.createWorkflow.execute({
      scope: readWorkspaceScope(request),
      name: payload.name,
      triggerType: payload.triggerType ?? null,
      definition: payload.definition,
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getWorkflow',
    summary: 'Read a workflow from the current workspace',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: workflowResponseSchema })
  get(
    @Req() request: WorkspaceScopedHttpRequest,
    @Param('id') id: string,
  ): Promise<WorkflowResponseDto> {
    return this.getWorkflow.execute({
      scope: readWorkspaceScope(request),
      id: parseWorkflowId(id),
    });
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'updateWorkflow', summary: 'Update a workflow draft' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: updateWorkflowRequestSchema })
  @ApiOkResponse({ schema: workflowResponseSchema })
  update(
    @Req() request: WorkflowHttpRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<WorkflowResponseDto> {
    const payload = parseUpdateWorkflowRequest(body);

    return this.updateWorkflow.execute({
      scope: readWorkspaceScope(request),
      id: parseWorkflowId(id),
      name: payload.name ?? null,
      triggerType: payload.triggerType ?? null,
      definition: payload.definition,
      hasDefinition: Object.prototype.hasOwnProperty.call(payload, 'definition'),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }
}

type WorkflowHttpRequest = WorkspaceScopedHttpRequest & {
  readonly ip?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
};

type ParsedCreateWorkflowRequest = {
  readonly name: string;
  readonly triggerType?: string;
  readonly definition?: unknown;
};

type ParsedUpdateWorkflowRequest = {
  readonly name?: string;
  readonly triggerType?: string;
  readonly definition?: unknown;
};

function parseCreateWorkflowRequest(body: unknown): ParsedCreateWorkflowRequest {
  if (!isRecord(body)) {
    throw invalidWorkflowPayload('Workflow payload must be an object');
  }

  const name = body.name;
  const triggerType = body.triggerType;

  if (typeof name !== 'string') {
    throw invalidWorkflowPayload('Workflow name is required');
  }

  if (triggerType !== undefined && typeof triggerType !== 'string') {
    throw invalidWorkflowPayload('Workflow trigger type must be a string');
  }

  return {
    name,
    ...(triggerType !== undefined ? { triggerType } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'definition')
      ? { definition: body.definition }
      : {}),
  };
}

function parseUpdateWorkflowRequest(body: unknown): ParsedUpdateWorkflowRequest {
  if (!isRecord(body)) {
    throw invalidWorkflowPayload('Workflow update payload must be an object');
  }

  const name = body.name;
  const triggerType = body.triggerType;

  if (name !== undefined && typeof name !== 'string') {
    throw invalidWorkflowPayload('Workflow name must be a string');
  }

  if (triggerType !== undefined && typeof triggerType !== 'string') {
    throw invalidWorkflowPayload('Workflow trigger type must be a string');
  }

  return {
    ...(name !== undefined ? { name } : {}),
    ...(triggerType !== undefined ? { triggerType } : {}),
    ...(Object.prototype.hasOwnProperty.call(body, 'definition')
      ? { definition: body.definition }
      : {}),
  };
}

function parseWorkflowId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw invalidWorkflowPayload('Workflow id must be a valid UUID');
  }

  return id;
}

function readHeader(
  request: WorkflowHttpRequest,
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

function readClientIp(request: WorkflowHttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidWorkflowPayload(message: string): DomainError {
  return new DomainError({
    code: 'WORKFLOW_PAYLOAD_INVALID',
    category: 'validation',
    message,
  });
}
