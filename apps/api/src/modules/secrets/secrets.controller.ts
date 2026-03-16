import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  DeleteConnectorCredentialUseCase,
  DeleteWorkflowSecretUseCase,
  ListConnectorCredentialsUseCase,
  ListWorkflowSecretsUseCase,
  UpsertConnectorCredentialUseCase,
  UpsertWorkflowSecretUseCase,
} from '@runlane/application';
import type {
  ConnectorCredentialResponseDto,
  DeleteConnectorCredentialResponseDto,
  DeleteWorkflowSecretResponseDto,
  ListConnectorCredentialsResponseDto,
  ListWorkflowSecretsResponseDto,
  WorkflowSecretResponseDto,
} from '@runlane/contracts';
import { CONNECTOR_CREDENTIAL_TYPES, DomainError } from '@runlane/domain';
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
  readonly additionalProperties?: boolean | OpenApiSchemaObject;
  readonly nullable?: boolean;
};

const workflowSecretSchema = {
  type: 'object',
  required: ['id', 'workspaceId', 'workflowId', 'key', 'maskedValue', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    workspaceId: { type: 'string', format: 'uuid' },
    workflowId: { type: 'string', format: 'uuid' },
    key: { type: 'string', example: 'routing_token' },
    maskedValue: { type: 'string', example: '********' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const connectorCredentialSchema = {
  type: 'object',
  required: [
    'id',
    'workspaceId',
    'workflowId',
    'name',
    'type',
    'maskedValue',
    'metadata',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    workspaceId: { type: 'string', format: 'uuid' },
    workflowId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'primary_crm' },
    type: { type: 'string', enum: [...CONNECTOR_CREDENTIAL_TYPES] },
    maskedValue: { type: 'string', example: '********' },
    metadata: { type: 'object', additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const upsertWorkflowSecretRequestSchema = {
  type: 'object',
  required: ['key', 'value'],
  properties: {
    key: { type: 'string', minLength: 2, maxLength: 128, example: 'routing_token' },
    value: { type: 'string', minLength: 1, maxLength: 8192, example: 'secret-token-value' },
  },
  additionalProperties: false,
} satisfies OpenApiSchemaObject;

const upsertConnectorCredentialRequestSchema = {
  type: 'object',
  required: ['name', 'type', 'value'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 120, example: 'primary_crm' },
    type: { type: 'string', enum: [...CONNECTOR_CREDENTIAL_TYPES], example: 'bearer_token' },
    value: { type: 'string', minLength: 1, maxLength: 8192, example: 'credential-value' },
    metadata: {
      type: 'object',
      additionalProperties: true,
      example: { provider: 'crm', headerName: 'Authorization' },
    },
  },
  additionalProperties: false,
} satisfies OpenApiSchemaObject;

const workflowSecretResponseSchema = {
  type: 'object',
  required: ['secret'],
  properties: { secret: workflowSecretSchema },
} satisfies OpenApiSchemaObject;

const listWorkflowSecretsResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: workflowSecretSchema } },
} satisfies OpenApiSchemaObject;

const connectorCredentialResponseSchema = {
  type: 'object',
  required: ['credential'],
  properties: { credential: connectorCredentialSchema },
} satisfies OpenApiSchemaObject;

const listConnectorCredentialsResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: connectorCredentialSchema } },
} satisfies OpenApiSchemaObject;

const deleteResponseSchema = {
  type: 'object',
  required: ['deleted'],
  properties: { deleted: { type: 'boolean', enum: [true] } },
} satisfies OpenApiSchemaObject;

@ApiTags('Workflow Secrets')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Workspace access is denied' })
@UseGuards(WorkspaceTenantGuard)
@Controller({ path: 'workflows/:workflowId', version: '1' })
export class SecretsController {
  constructor(
    @Inject(UpsertWorkflowSecretUseCase)
    private readonly upsertWorkflowSecret: UpsertWorkflowSecretUseCase,
    @Inject(ListWorkflowSecretsUseCase)
    private readonly listWorkflowSecrets: ListWorkflowSecretsUseCase,
    @Inject(DeleteWorkflowSecretUseCase)
    private readonly deleteWorkflowSecret: DeleteWorkflowSecretUseCase,
    @Inject(UpsertConnectorCredentialUseCase)
    private readonly upsertConnectorCredential: UpsertConnectorCredentialUseCase,
    @Inject(ListConnectorCredentialsUseCase)
    private readonly listConnectorCredentials: ListConnectorCredentialsUseCase,
    @Inject(DeleteConnectorCredentialUseCase)
    private readonly deleteConnectorCredential: DeleteConnectorCredentialUseCase,
  ) {}

  @Get('secrets')
  @ApiOperation({ operationId: 'listWorkflowSecrets', summary: 'List masked workflow secrets' })
  @ApiParam({ name: 'workflowId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: listWorkflowSecretsResponseSchema })
  listSecrets(
    @Req() request: WorkspaceScopedHttpRequest,
    @Param('workflowId') workflowId: string,
  ): Promise<ListWorkflowSecretsResponseDto> {
    return this.listWorkflowSecrets.execute({
      scope: readWorkspaceScope(request),
      workflowId: parseUuid(workflowId, 'Workflow id must be a valid UUID'),
    });
  }

  @Post('secrets')
  @ApiOperation({
    operationId: 'upsertWorkflowSecret',
    summary: 'Create or rotate a workflow secret',
  })
  @ApiParam({ name: 'workflowId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: upsertWorkflowSecretRequestSchema })
  @ApiCreatedResponse({ schema: workflowSecretResponseSchema })
  upsertSecret(
    @Req() request: SecretsHttpRequest,
    @Param('workflowId') workflowId: string,
    @Body() body: unknown,
  ): Promise<WorkflowSecretResponseDto> {
    const payload = parseWorkflowSecretRequest(body);

    return this.upsertWorkflowSecret.execute({
      scope: readWorkspaceScope(request),
      workflowId: parseUuid(workflowId, 'Workflow id must be a valid UUID'),
      key: payload.key,
      value: payload.value,
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Delete('secrets/:key')
  @ApiOperation({ operationId: 'deleteWorkflowSecret', summary: 'Delete a workflow secret' })
  @ApiParam({ name: 'workflowId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'key', schema: { type: 'string', example: 'routing_token' } })
  @ApiOkResponse({ schema: deleteResponseSchema })
  deleteSecret(
    @Req() request: SecretsHttpRequest,
    @Param('workflowId') workflowId: string,
    @Param('key') key: string,
  ): Promise<DeleteWorkflowSecretResponseDto> {
    return this.deleteWorkflowSecret.execute({
      scope: readWorkspaceScope(request),
      workflowId: parseUuid(workflowId, 'Workflow id must be a valid UUID'),
      key,
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Get('connector-credentials')
  @ApiOperation({
    operationId: 'listConnectorCredentials',
    summary: 'List masked connector credentials for a workflow',
  })
  @ApiParam({ name: 'workflowId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: listConnectorCredentialsResponseSchema })
  listCredentials(
    @Req() request: WorkspaceScopedHttpRequest,
    @Param('workflowId') workflowId: string,
  ): Promise<ListConnectorCredentialsResponseDto> {
    return this.listConnectorCredentials.execute({
      scope: readWorkspaceScope(request),
      workflowId: parseUuid(workflowId, 'Workflow id must be a valid UUID'),
    });
  }

  @Post('connector-credentials')
  @ApiOperation({
    operationId: 'upsertConnectorCredential',
    summary: 'Create or rotate a connector credential',
  })
  @ApiParam({ name: 'workflowId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: upsertConnectorCredentialRequestSchema })
  @ApiCreatedResponse({ schema: connectorCredentialResponseSchema })
  upsertCredential(
    @Req() request: SecretsHttpRequest,
    @Param('workflowId') workflowId: string,
    @Body() body: unknown,
  ): Promise<ConnectorCredentialResponseDto> {
    const payload = parseConnectorCredentialRequest(body);

    return this.upsertConnectorCredential.execute({
      scope: readWorkspaceScope(request),
      workflowId: parseUuid(workflowId, 'Workflow id must be a valid UUID'),
      name: payload.name,
      type: payload.type,
      value: payload.value,
      metadata: payload.metadata,
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Delete('connector-credentials/:name')
  @ApiOperation({
    operationId: 'deleteConnectorCredential',
    summary: 'Delete a connector credential',
  })
  @ApiParam({ name: 'workflowId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'name', schema: { type: 'string', example: 'primary_crm' } })
  @ApiOkResponse({ schema: deleteResponseSchema })
  deleteCredential(
    @Req() request: SecretsHttpRequest,
    @Param('workflowId') workflowId: string,
    @Param('name') name: string,
  ): Promise<DeleteConnectorCredentialResponseDto> {
    return this.deleteConnectorCredential.execute({
      scope: readWorkspaceScope(request),
      workflowId: parseUuid(workflowId, 'Workflow id must be a valid UUID'),
      name,
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }
}

type SecretsHttpRequest = WorkspaceScopedHttpRequest & {
  readonly ip?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
};

type ParsedWorkflowSecretRequest = {
  readonly key: string;
  readonly value: string;
};

type ParsedConnectorCredentialRequest = {
  readonly name: string;
  readonly type: string;
  readonly value: string;
  readonly metadata?: unknown;
};

function parseWorkflowSecretRequest(body: unknown): ParsedWorkflowSecretRequest {
  if (!isRecord(body)) {
    throw invalidSecretPayload('Workflow secret payload must be an object');
  }

  if (typeof body.key !== 'string') {
    throw invalidSecretPayload('Workflow secret key is required');
  }

  if (typeof body.value !== 'string') {
    throw invalidSecretPayload('Workflow secret value is required');
  }

  return {
    key: body.key,
    value: body.value,
  };
}

function parseConnectorCredentialRequest(body: unknown): ParsedConnectorCredentialRequest {
  if (!isRecord(body)) {
    throw invalidSecretPayload('Connector credential payload must be an object');
  }

  if (typeof body.name !== 'string') {
    throw invalidSecretPayload('Connector credential name is required');
  }

  if (typeof body.type !== 'string') {
    throw invalidSecretPayload('Connector credential type is required');
  }

  if (typeof body.value !== 'string') {
    throw invalidSecretPayload('Connector credential value is required');
  }

  return {
    name: body.name,
    type: body.type,
    value: body.value,
    ...(Object.prototype.hasOwnProperty.call(body, 'metadata') ? { metadata: body.metadata } : {}),
  };
}

function parseUuid(value: string, message: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw invalidSecretPayload(message);
  }

  return value;
}

function readHeader(
  request: SecretsHttpRequest,
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

function readClientIp(request: SecretsHttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidSecretPayload(message: string): DomainError {
  return new DomainError({
    code: 'SECRET_PAYLOAD_INVALID',
    category: 'validation',
    message,
  });
}
