import type { JsonValue } from '@runlane/contracts';
import type { BillingEventStatus, BillingProvider } from '@runlane/domain';

export const BILLING_EVENT_REPOSITORY = Symbol('BILLING_EVENT_REPOSITORY');

export interface StoredBillingEventRecord {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly provider: BillingProvider;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly status: BillingEventStatus;
  readonly payload: JsonValue;
  readonly errorMessage: string | null;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBillingEventInput {
  readonly workspaceId: string | null;
  readonly provider: BillingProvider;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly status: BillingEventStatus;
  readonly payload: JsonValue;
  readonly errorMessage: string | null;
  readonly receivedAt: Date;
}

export interface UpdateBillingEventStatusInput {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly status: BillingEventStatus;
  readonly errorMessage: string | null;
  readonly processedAt: Date | null;
}

export interface BillingEventRepositoryPort {
  findByProviderEventId(
    input: Readonly<{ provider: BillingProvider; providerEventId: string }>,
  ): Promise<StoredBillingEventRecord | null>;
  create(input: CreateBillingEventInput): Promise<StoredBillingEventRecord>;
  updateStatus(input: UpdateBillingEventStatusInput): Promise<StoredBillingEventRecord>;
}
