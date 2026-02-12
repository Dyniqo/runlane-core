import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateWebhookRequestInput,
  FindWebhookRequestByIdempotencyKeyInput,
  StoredWebhookRequestRecord,
  WebhookRequestRepositoryPort,
} from '@runlane/application';
import type { WebhookRequestStatus } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaWebhookRequestRepository implements WebhookRequestRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async create(input: CreateWebhookRequestInput): Promise<StoredWebhookRequestRecord> {
    const request = await this.persistence.client.webhookRequest.create({
      data: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        signature: input.signature,
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
        source: input.source,
        ip: input.ip,
        userAgent: input.userAgent,
        status: mapWebhookRequestStatusToPrisma(input.status),
      },
      select: webhookRequestSelect,
    });

    return mapWebhookRequestRecord(request);
  }

  async findLatestByIdempotencyKey(
    input: FindWebhookRequestByIdempotencyKeyInput,
  ): Promise<StoredWebhookRequestRecord | null> {
    const request = await this.persistence.client.webhookRequest.findFirst({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        idempotencyKey: input.idempotencyKey,
        status: 'ACCEPTED',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: webhookRequestSelect,
    });

    return request ? mapWebhookRequestRecord(request) : null;
  }
}

const webhookRequestSelect = {
  id: true,
  workspaceId: true,
  workflowId: true,
  signature: true,
  idempotencyKey: true,
  payloadHash: true,
  source: true,
  ip: true,
  userAgent: true,
  status: true,
  createdAt: true,
} as const;

type PrismaWebhookRequestRecord = {
  readonly id: string;
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly signature: string | null;
  readonly idempotencyKey: string | null;
  readonly payloadHash: string;
  readonly source: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly status: string;
  readonly createdAt: Date;
};

function mapWebhookRequestRecord(record: PrismaWebhookRequestRecord): StoredWebhookRequestRecord {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    workflowId: record.workflowId,
    signature: record.signature,
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
    source: record.source,
    ip: record.ip,
    userAgent: record.userAgent,
    status: mapWebhookRequestStatus(record.status),
    createdAt: record.createdAt,
  };
}

function mapWebhookRequestStatus(status: string): WebhookRequestStatus {
  if (status === 'ACCEPTED') {
    return 'accepted';
  }

  if (status === 'REJECTED') {
    return 'rejected';
  }

  throw new TypeError(`Unsupported webhook request status '${status}'`);
}

function mapWebhookRequestStatusToPrisma(status: WebhookRequestStatus): 'ACCEPTED' | 'REJECTED' {
  if (status === 'accepted') {
    return 'ACCEPTED';
  }

  if (status === 'rejected') {
    return 'REJECTED';
  }

  throw new TypeError(`Unsupported webhook request status '${status}'`);
}
