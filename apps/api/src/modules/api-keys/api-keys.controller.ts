import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateApiKeyUseCase, ListApiKeysUseCase, RevokeApiKeyUseCase } from '@runlane/application';
import type {
  CreateApiKeyRequestDto,
  CreateApiKeyResponseDto,
  CurrentApiKeyResponseDto,
  ListApiKeysResponseDto,
  RevokeApiKeyResponseDto,
} from '@runlane/contracts';
import { DomainError } from '@runlane/domain';
import {
  ApiKeyGuard,
  readApiKeyScope,
  readWorkspaceScope,
  WorkspaceTenantGuard,
} from '@runlane/infrastructure';
import type { ApiKeyScopedHttpRequest, WorkspaceScopedHttpRequest } from '@runlane/infrastructure';

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
};

const createApiKeyRequestSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 120, example: 'Primary automation key' },
  },
} satisfies OpenApiSchemaObject;

const apiKeySchema = {
  type: 'object',
  required: ['id', 'name', 'prefix', 'lastUsedAt', 'revokedAt', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    prefix: { type: 'string', example: 'rln_QHCs5i-2Va0' },
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const currentApiKeyResponseSchema = {
  type: 'object',
  required: ['apiKey'],
  properties: {
    apiKey: {
      type: 'object',
      required: ['id', 'workspaceId', 'name', 'prefix', 'lastUsedAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        workspaceId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        prefix: { type: 'string', example: 'rln_QHCs5i-2Va0' },
        lastUsedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} satisfies OpenApiSchemaObject;

const createApiKeyResponseSchema = {
  type: 'object',
  required: ['apiKey', 'token'],
  properties: {
    apiKey: apiKeySchema,
    token: {
      type: 'string',
      example: 'rln_QHCs5i-2Va0_fKdtTz6v9tSAs9Yx5oG0P9d6L2McZbq4P3v0GxR1Tzk',
    },
  },
} satisfies OpenApiSchemaObject;

const listApiKeysResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: apiKeySchema,
    },
  },
} satisfies OpenApiSchemaObject;

const revokeApiKeyResponseSchema = {
  type: 'object',
  required: ['revoked'],
  properties: {
    revoked: { type: 'boolean', enum: [true] },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('API Keys')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Workspace access is denied' })
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(
    @Inject(CreateApiKeyUseCase) private readonly createApiKey: CreateApiKeyUseCase,
    @Inject(ListApiKeysUseCase) private readonly listApiKeys: ListApiKeysUseCase,
    @Inject(RevokeApiKeyUseCase) private readonly revokeApiKey: RevokeApiKeyUseCase,
  ) {}

  @Get('current')
  @ApiOperation({ operationId: 'getCurrentApiKey', summary: 'Resolve the current API key scope' })
  @ApiHeader({
    name: 'X-Runlane-Api-Key',
    required: false,
    description: 'API key token. ApiKey authorization is also supported.',
  })
  @ApiOkResponse({ schema: currentApiKeyResponseSchema })
  @UseGuards(ApiKeyGuard)
  current(@Req() request: ApiKeyScopedHttpRequest): CurrentApiKeyResponseDto {
    const scope = readApiKeyScope(request);

    return {
      apiKey: {
        id: scope.apiKeyId,
        workspaceId: scope.workspaceId,
        name: scope.name,
        prefix: scope.prefix,
        lastUsedAt: scope.lastUsedAt.toISOString(),
      },
    };
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'listApiKeys', summary: 'List API keys for the current workspace' })
  @ApiOkResponse({ schema: listApiKeysResponseSchema })
  @UseGuards(WorkspaceTenantGuard)
  list(@Req() request: WorkspaceScopedHttpRequest): Promise<ListApiKeysResponseDto> {
    return this.listApiKeys.execute({ scope: readWorkspaceScope(request) });
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'createApiKey',
    summary: 'Create an API key for the current workspace',
  })
  @ApiBody({ schema: createApiKeyRequestSchema })
  @ApiCreatedResponse({ schema: createApiKeyResponseSchema })
  @UseGuards(WorkspaceTenantGuard)
  create(
    @Req() request: WorkspaceScopedHttpRequest,
    @Body() body: unknown,
  ): Promise<CreateApiKeyResponseDto> {
    return this.createApiKey.execute({
      scope: readWorkspaceScope(request),
      name: parseCreateApiKeyRequest(body).name,
    });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'revokeApiKey', summary: 'Revoke an API key' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: revokeApiKeyResponseSchema })
  @UseGuards(WorkspaceTenantGuard)
  revoke(
    @Req() request: WorkspaceScopedHttpRequest,
    @Param('id') id: string,
  ): Promise<RevokeApiKeyResponseDto> {
    return this.revokeApiKey.execute({
      scope: readWorkspaceScope(request),
      id: parseApiKeyId(id),
    });
  }
}

function parseCreateApiKeyRequest(body: unknown): CreateApiKeyRequestDto {
  if (!isRecord(body)) {
    throw invalidApiKeyPayload('API key payload must be an object');
  }

  const name = body.name;

  if (typeof name !== 'string') {
    throw invalidApiKeyPayload('API key name is required');
  }

  return { name };
}

function parseApiKeyId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw invalidApiKeyPayload('API key id must be a valid UUID');
  }

  return id;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidApiKeyPayload(message: string): DomainError {
  return new DomainError({
    code: 'API_KEY_PAYLOAD_INVALID',
    category: 'validation',
    message,
  });
}
