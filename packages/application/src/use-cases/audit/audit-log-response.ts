import type { AuditLogResponseDto, ListAuditLogsResponseDto } from '@runlane/contracts';
import type { StoredAuditLogRecord } from '../../ports';

export function buildAuditLogResponse(record: StoredAuditLogRecord): AuditLogResponseDto {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    actorUserId: record.actorUserId,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    metadata: record.metadata,
    ip: record.ip,
    userAgent: record.userAgent,
    createdAt: record.createdAt.toISOString(),
  };
}

export function buildListAuditLogsResponse(input: {
  readonly records: readonly StoredAuditLogRecord[];
  readonly limit: number;
}): ListAuditLogsResponseDto {
  const visibleRecords = input.records.slice(0, input.limit);
  const hasMore = input.records.length > input.limit;

  return {
    items: visibleRecords.map((record) => buildAuditLogResponse(record)),
    nextCursor: hasMore ? (visibleRecords.at(-1)?.id ?? null) : null,
    hasMore,
  };
}
