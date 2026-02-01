import type { JsonValue } from '@runlane/contracts';
import type { AuditAction, AuditEntityType } from '@runlane/domain';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export interface StoredAuditLogRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string | null;
  readonly metadata: JsonValue;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface CreateAuditLogInput {
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string | null;
  readonly metadata: JsonValue;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface ListAuditLogsInput {
  readonly workspaceId: string;
  readonly cursor: string | null;
  readonly limit: number;
}

export interface AuditLogRepositoryPort {
  create(input: CreateAuditLogInput): Promise<StoredAuditLogRecord>;
  listForWorkspace(input: ListAuditLogsInput): Promise<readonly StoredAuditLogRecord[]>;
  findCursorForWorkspace(
    input: Readonly<{ workspaceId: string; cursor: string }>,
  ): Promise<StoredAuditLogRecord | null>;
}
