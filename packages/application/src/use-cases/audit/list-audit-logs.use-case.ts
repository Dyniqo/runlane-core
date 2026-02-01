import type { ListAuditLogsResponseDto } from '@runlane/contracts';
import type { AuditLogRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { invalidAuditCursor } from './audit-log-errors';
import { buildListAuditLogsResponse } from './audit-log-response';

const DEFAULT_AUDIT_LOG_LIMIT = 50;
const MAX_AUDIT_LOG_LIMIT = 100;

export interface ListAuditLogsUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly cursor: string | null;
  readonly limit: number | null;
}

export class ListAuditLogsUseCase implements UseCase<
  ListAuditLogsUseCaseInput,
  ListAuditLogsResponseDto
> {
  constructor(private readonly auditLogs: AuditLogRepositoryPort) {}

  async execute(input: ListAuditLogsUseCaseInput): Promise<ListAuditLogsResponseDto> {
    const limit = normalizeLimit(input.limit);

    if (input.cursor) {
      const cursor = await this.auditLogs.findCursorForWorkspace({
        workspaceId: input.scope.workspaceId,
        cursor: input.cursor,
      });

      if (!cursor) {
        throw invalidAuditCursor();
      }
    }

    const records = await this.auditLogs.listForWorkspace({
      workspaceId: input.scope.workspaceId,
      cursor: input.cursor,
      limit: limit + 1,
    });

    return buildListAuditLogsResponse({ records, limit });
  }
}

function normalizeLimit(limit: number | null): number {
  if (limit === null) {
    return DEFAULT_AUDIT_LOG_LIMIT;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    return DEFAULT_AUDIT_LOG_LIMIT;
  }

  return Math.min(limit, MAX_AUDIT_LOG_LIMIT);
}
