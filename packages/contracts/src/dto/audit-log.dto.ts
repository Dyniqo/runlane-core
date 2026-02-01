import type { JsonValue } from '../shared';

export interface AuditLogResponseDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata: JsonValue;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
}

export interface ListAuditLogsResponseDto {
  readonly items: readonly AuditLogResponseDto[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
