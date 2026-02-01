import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AuditLogRepositoryPort,
  CreateAuditLogInput,
  ListAuditLogsInput,
  StoredAuditLogRecord,
} from '@runlane/application';
import type { JsonValue } from '@runlane/contracts';
import type { AuditAction, AuditEntityType } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async create(input: CreateAuditLogInput): Promise<StoredAuditLogRecord> {
    const record = await this.persistence.client.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadataJson: input.metadata as Prisma.InputJsonValue,
        ip: input.ip,
        userAgent: input.userAgent,
      },
      select: auditLogSelect,
    });

    return mapAuditLogRecord(record);
  }

  async listForWorkspace(input: ListAuditLogsInput): Promise<readonly StoredAuditLogRecord[]> {
    const cursor = input.cursor
      ? await this.persistence.client.auditLog.findFirst({
          where: {
            id: input.cursor,
            workspaceId: input.workspaceId,
          },
          select: {
            id: true,
            createdAt: true,
          },
        })
      : null;

    const records = await this.persistence.client.auditLog.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: auditLogSelect,
    });

    return records.map((record) => mapAuditLogRecord(record));
  }

  async findCursorForWorkspace(input: {
    readonly workspaceId: string;
    readonly cursor: string;
  }): Promise<StoredAuditLogRecord | null> {
    const record = await this.persistence.client.auditLog.findFirst({
      where: {
        id: input.cursor,
        workspaceId: input.workspaceId,
      },
      select: auditLogSelect,
    });

    return record ? mapAuditLogRecord(record) : null;
  }
}

const auditLogSelect = {
  id: true,
  workspaceId: true,
  actorUserId: true,
  action: true,
  entityType: true,
  entityId: true,
  metadataJson: true,
  ip: true,
  userAgent: true,
  createdAt: true,
} as const;

type PrismaAuditLogRecord = {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadataJson: Prisma.JsonValue;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
};

function mapAuditLogRecord(record: PrismaAuditLogRecord): StoredAuditLogRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    actorUserId: record.actorUserId,
    action: record.action as AuditAction,
    entityType: record.entityType as AuditEntityType,
    entityId: record.entityId,
    metadata: record.metadataJson as JsonValue,
    ip: record.ip,
    userAgent: record.userAgent,
    createdAt: record.createdAt,
  };
}
