import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ListAuditLogsUseCase } from '@runlane/application';
import type { ListAuditLogsUseCaseInput } from '@runlane/application';
import type { ListAuditLogsResponseDto } from '@runlane/contracts';
import { DomainError } from '@runlane/domain';
import { readWorkspaceScope, WorkspaceTenantGuard } from '@runlane/infrastructure';
import type { WorkspaceScopedHttpRequest } from '@runlane/infrastructure';

type OpenApiSchemaObject = {
  readonly type?: string;
  readonly format?: string;
  readonly example?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly required?: string[];
  readonly properties?: Record<string, OpenApiSchemaObject>;
  readonly items?: OpenApiSchemaObject;
  readonly nullable?: boolean;
};

const auditLogSchema = {
  type: 'object',
  required: [
    'id',
    'workspaceId',
    'actorUserId',
    'action',
    'entityType',
    'entityId',
    'metadata',
    'ip',
    'userAgent',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    workspaceId: { type: 'string', format: 'uuid' },
    actorUserId: { type: 'string', format: 'uuid', nullable: true },
    action: { type: 'string', example: 'identity.user_logged_in' },
    entityType: { type: 'string', example: 'session' },
    entityId: { type: 'string', nullable: true },
    metadata: { type: 'object' },
    ip: { type: 'string', nullable: true },
    userAgent: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const listAuditLogsResponseSchema = {
  type: 'object',
  required: ['items', 'nextCursor', 'hasMore'],
  properties: {
    items: {
      type: 'array',
      items: auditLogSchema,
    },
    nextCursor: { type: 'string', nullable: true },
    hasMore: { type: 'boolean' },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Audit Logs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Workspace access is denied' })
@UseGuards(WorkspaceTenantGuard)
@Controller({ path: 'audit-logs', version: '1' })
export class AuditLogsController {
  constructor(@Inject(ListAuditLogsUseCase) private readonly listAuditLogs: ListAuditLogsUseCase) {}

  @Get()
  @ApiOperation({
    operationId: 'listAuditLogs',
    summary: 'List audit logs for the current workspace',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiOkResponse({ schema: listAuditLogsResponseSchema })
  list(
    @Req() request: WorkspaceScopedHttpRequest,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<ListAuditLogsResponseDto> {
    return this.listAuditLogs.execute({
      scope: readWorkspaceScope(request),
      cursor: parseCursor(cursor),
      limit: parseLimit(limit),
    });
  }
}

function parseCursor(cursor: string | undefined): ListAuditLogsUseCaseInput['cursor'] {
  if (cursor === undefined || cursor.length === 0) {
    return null;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor)) {
    throw invalidAuditQuery('Audit cursor must be a valid UUID');
  }

  return cursor;
}

function parseLimit(limit: string | undefined): ListAuditLogsUseCaseInput['limit'] {
  if (limit === undefined || limit.length === 0) {
    return null;
  }

  const parsedLimit = Number.parseInt(limit, 10);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw invalidAuditQuery('Audit limit must be an integer between 1 and 100');
  }

  return parsedLimit;
}

function invalidAuditQuery(message: string): DomainError {
  return new DomainError({
    code: 'AUDIT_QUERY_INVALID',
    category: 'validation',
    message,
  });
}
