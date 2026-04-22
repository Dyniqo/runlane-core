import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ResetDemoWorkspaceUseCase, SeedDemoWorkspaceUseCase } from '@runlane/application';
import type { DemoResetResponseDto, DemoSeedResponseDto } from '@runlane/contracts';
import {
  readWorkspaceScope,
  WorkspaceTenantGuard,
  type WorkspaceScopedHttpRequest,
} from '@runlane/infrastructure';

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

interface HttpRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly ip?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
}

const demoCredentialSchema = {
  type: 'object',
  required: ['email', 'password', 'apiKey'],
  properties: {
    email: { type: 'string', format: 'email', example: 'demo@runlane.local' },
    password: { type: 'string', example: 'RunlaneDemoPassword123!' },
    apiKey: {
      type: 'string',
      example: 'rln_demoDemo001_demoDemoDemoDemoDemoDemoDemoDemoDemoDemo001',
    },
  },
} satisfies OpenApiSchemaObject;

const demoUserSchema = {
  type: 'object',
  required: ['id', 'email', 'name'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
  },
} satisfies OpenApiSchemaObject;

const demoWorkspaceSchema = {
  type: 'object',
  required: ['id', 'name', 'isDemo'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    isDemo: { type: 'boolean', enum: [true] },
  },
} satisfies OpenApiSchemaObject;

const demoApiKeySchema = {
  type: 'object',
  required: ['id', 'prefix', 'name'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    prefix: { type: 'string', example: 'rln_demoDemo001' },
    name: { type: 'string', example: 'Demo automation key' },
  },
} satisfies OpenApiSchemaObject;

const demoWorkflowSchema = {
  type: 'object',
  required: ['id', 'publicId', 'name', 'triggerType', 'status', 'version'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    publicId: { type: 'string', example: 'wf_00000000000000000000000000000040' },
    name: { type: 'string', example: 'AI Lead Routing Demo' },
    triggerType: { type: 'string', enum: ['webhook', 'automation'] },
    status: { type: 'string', enum: ['published'] },
    version: { type: 'integer', minimum: 1 },
  },
} satisfies OpenApiSchemaObject;

const demoLimitsSchema = {
  type: 'object',
  required: ['executionsPerHour', 'aiCallsPerDay'],
  properties: {
    executionsPerHour: { type: 'integer', minimum: 1 },
    aiCallsPerDay: { type: 'integer', minimum: 0 },
  },
} satisfies OpenApiSchemaObject;

const demoStateSchema = {
  type: 'object',
  required: [
    'enabled',
    'seedVersion',
    'resetAt',
    'credentials',
    'user',
    'workspace',
    'apiKey',
    'workflows',
    'limits',
    'publicRegistrationEnabled',
  ],
  properties: {
    enabled: { type: 'boolean', enum: [true] },
    seedVersion: { type: 'string', example: 'demo-seed-v1' },
    resetAt: { type: 'string', format: 'date-time' },
    credentials: demoCredentialSchema,
    user: demoUserSchema,
    workspace: demoWorkspaceSchema,
    apiKey: demoApiKeySchema,
    workflows: { type: 'array', items: demoWorkflowSchema },
    limits: demoLimitsSchema,
    publicRegistrationEnabled: { type: 'boolean' },
  },
} satisfies OpenApiSchemaObject;

const demoSeedResponseSchema = {
  type: 'object',
  required: ['demo'],
  properties: {
    demo: demoStateSchema,
  },
} satisfies OpenApiSchemaObject;

const demoResetResponseSchema = {
  type: 'object',
  required: ['reset', 'demo'],
  properties: {
    reset: { type: 'boolean', enum: [true] },
    demo: demoStateSchema,
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Demo')
@Controller({ path: 'demo', version: '1' })
export class DemoController {
  constructor(
    @Inject(SeedDemoWorkspaceUseCase) private readonly seedDemo: SeedDemoWorkspaceUseCase,
    @Inject(ResetDemoWorkspaceUseCase) private readonly resetDemo: ResetDemoWorkspaceUseCase,
  ) {}

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'seedDemoWorkspace', summary: 'Seed the configured demo workspace' })
  @ApiOkResponse({ schema: demoSeedResponseSchema })
  @ApiForbiddenResponse({ description: 'Demo mode is disabled' })
  seed(@Req() request: HttpRequest): Promise<DemoSeedResponseDto> {
    return this.seedDemo.execute({
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'resetDemoWorkspace', summary: 'Reset the current demo workspace' })
  @ApiOkResponse({ schema: demoResetResponseSchema })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Demo workspace access is required' })
  @UseGuards(WorkspaceTenantGuard)
  reset(@Req() request: WorkspaceScopedHttpRequest): Promise<DemoResetResponseDto> {
    return this.resetDemo.execute({
      scope: readWorkspaceScope(request),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }
}

function readHeader(request: HttpRequest, name: string, maximumLength: number): string | null {
  const value = request.headers[name];
  const headerValue = Array.isArray(value) ? value[0] : value;

  if (!headerValue) {
    return null;
  }

  return headerValue.slice(0, maximumLength);
}

function readClientIp(request: HttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}
