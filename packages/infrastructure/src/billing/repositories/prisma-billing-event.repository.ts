import { Inject, Injectable } from '@nestjs/common';
import type {
  BillingEventRepositoryPort,
  CreateBillingEventInput,
  StoredBillingEventRecord,
  UpdateBillingEventStatusInput,
} from '@runlane/application';
import type { BillingEventStatus, BillingProvider } from '@runlane/domain';
import type { JsonValue } from '@runlane/contracts';
import type { Prisma } from '@prisma/client';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaBillingEventRepository implements BillingEventRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async findByProviderEventId(input: {
    readonly provider: BillingProvider;
    readonly providerEventId: string;
  }): Promise<StoredBillingEventRecord | null> {
    const event = await this.persistence.client.billingEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: mapBillingProviderToPrisma(input.provider),
          providerEventId: input.providerEventId,
        },
      },
    });

    return event ? mapBillingEvent(event) : null;
  }

  async create(input: CreateBillingEventInput): Promise<StoredBillingEventRecord> {
    const event = await this.persistence.client.billingEvent.create({
      data: {
        workspaceId: input.workspaceId,
        provider: mapBillingProviderToPrisma(input.provider),
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        status: mapBillingEventStatusToPrisma(input.status),
        payloadJson: input.payload as Prisma.InputJsonValue,
        errorMessage: input.errorMessage,
        receivedAt: input.receivedAt,
      },
    });

    return mapBillingEvent(event);
  }

  async updateStatus(input: UpdateBillingEventStatusInput): Promise<StoredBillingEventRecord> {
    const event = await this.persistence.client.billingEvent.update({
      where: { id: input.id },
      data: {
        workspaceId: input.workspaceId,
        status: mapBillingEventStatusToPrisma(input.status),
        errorMessage: input.errorMessage,
        processedAt: input.processedAt,
      },
    });

    return mapBillingEvent(event);
  }
}

interface PrismaBillingEventRecord {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly provider: string;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly status: string;
  readonly payloadJson: unknown;
  readonly errorMessage: string | null;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function mapBillingEvent(event: PrismaBillingEventRecord): StoredBillingEventRecord {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    provider: event.provider.toLowerCase() as BillingProvider,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    status: event.status.toLowerCase() as BillingEventStatus,
    payload: event.payloadJson as JsonValue,
    errorMessage: event.errorMessage,
    receivedAt: event.receivedAt,
    processedAt: event.processedAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

type PrismaBillingProvider = 'STRIPE';
type PrismaBillingEventStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';

function mapBillingProviderToPrisma(provider: BillingProvider): PrismaBillingProvider {
  if (provider === 'stripe') {
    return 'STRIPE';
  }

  throw new TypeError('Billing provider is not supported');
}

function mapBillingEventStatusToPrisma(status: BillingEventStatus): PrismaBillingEventStatus {
  if (status === 'received') {
    return 'RECEIVED';
  }

  if (status === 'processed') {
    return 'PROCESSED';
  }

  if (status === 'ignored') {
    return 'IGNORED';
  }

  return 'FAILED';
}
