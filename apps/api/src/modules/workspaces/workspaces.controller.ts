import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  GetCurrentWorkspaceUseCase,
  ListWorkspacesUseCase,
  UpdateCurrentWorkspaceUseCase,
} from '@runlane/application';
import type {
  CurrentWorkspaceResponseDto,
  ListWorkspacesResponseDto,
  UpdateCurrentWorkspaceRequestDto,
} from '@runlane/contracts';
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
};

const workspaceSummarySchema = {
  type: 'object',
  required: ['id', 'name', 'role'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    role: { type: 'string', enum: ['owner', 'member'] },
  },
} satisfies OpenApiSchemaObject;

const workspaceScopeSchema = {
  type: 'object',
  required: ['userId', 'sessionId', 'workspaceId', 'role'],
  properties: {
    userId: { type: 'string', format: 'uuid' },
    sessionId: { type: 'string', format: 'uuid' },
    workspaceId: { type: 'string', format: 'uuid' },
    role: { type: 'string', enum: ['owner', 'member'] },
  },
} satisfies OpenApiSchemaObject;

const listWorkspacesResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: workspaceSummarySchema,
    },
  },
} satisfies OpenApiSchemaObject;

const currentWorkspaceResponseSchema = {
  type: 'object',
  required: ['workspace', 'scope'],
  properties: {
    workspace: workspaceSummarySchema,
    scope: workspaceScopeSchema,
  },
} satisfies OpenApiSchemaObject;

const updateCurrentWorkspaceRequestSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 120, example: 'Runlane Operations' },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Workspaces')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Workspace access is denied' })
@UseGuards(WorkspaceTenantGuard)
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(
    @Inject(ListWorkspacesUseCase) private readonly listWorkspaces: ListWorkspacesUseCase,
    @Inject(GetCurrentWorkspaceUseCase)
    private readonly getCurrentWorkspace: GetCurrentWorkspaceUseCase,
    @Inject(UpdateCurrentWorkspaceUseCase)
    private readonly updateCurrentWorkspace: UpdateCurrentWorkspaceUseCase,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listWorkspaces', summary: 'List accessible workspaces' })
  @ApiOkResponse({ schema: listWorkspacesResponseSchema })
  list(@Req() request: WorkspaceScopedHttpRequest): Promise<ListWorkspacesResponseDto> {
    return this.listWorkspaces.execute({ scope: readWorkspaceScope(request) });
  }

  @Get('current')
  @ApiOperation({ operationId: 'getCurrentWorkspace', summary: 'Read the current workspace scope' })
  @ApiOkResponse({ schema: currentWorkspaceResponseSchema })
  current(@Req() request: WorkspaceScopedHttpRequest): Promise<CurrentWorkspaceResponseDto> {
    return this.getCurrentWorkspace.execute({ scope: readWorkspaceScope(request) });
  }

  @Patch('current')
  @ApiOperation({ operationId: 'updateCurrentWorkspace', summary: 'Update the current workspace' })
  @ApiBody({ schema: updateCurrentWorkspaceRequestSchema })
  @ApiOkResponse({ schema: currentWorkspaceResponseSchema })
  update(
    @Req() request: WorkspaceHttpRequest,
    @Body() body: unknown,
  ): Promise<CurrentWorkspaceResponseDto> {
    return this.updateCurrentWorkspace.execute({
      scope: readWorkspaceScope(request),
      name: parseUpdateCurrentWorkspaceRequest(body).name,
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }
}

type WorkspaceHttpRequest = WorkspaceScopedHttpRequest & {
  readonly ip?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
};

function parseUpdateCurrentWorkspaceRequest(body: unknown): UpdateCurrentWorkspaceRequestDto {
  if (!isRecord(body)) {
    throw invalidWorkspacePayload('Workspace update payload must be an object');
  }

  const name = body.name;

  if (typeof name !== 'string') {
    throw invalidWorkspacePayload('Workspace name is required');
  }

  return { name };
}

function readHeader(
  request: WorkspaceHttpRequest,
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

function readClientIp(request: WorkspaceHttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidWorkspacePayload(message: string): DomainError {
  return new DomainError({
    code: 'WORKSPACE_PAYLOAD_INVALID',
    category: 'validation',
    message,
  });
}
