import type { BillingStatus, BillingSubscriptionState } from '@runlane/domain';
import type { WorkspacePlan } from '@runlane/domain';

export const BILLING_WORKSPACE_REPOSITORY = Symbol('BILLING_WORKSPACE_REPOSITORY');

export interface BillingWorkspaceRecord {
  readonly id: string;
  readonly plan: WorkspacePlan;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly billingStatus: BillingStatus;
}

export interface UpdateBillingSubscriptionStateInput extends BillingSubscriptionState {
  readonly workspaceId: string;
}

export interface BillingWorkspaceRepositoryPort {
  findByStripeCustomerId(stripeCustomerId: string): Promise<BillingWorkspaceRecord | null>;
  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<BillingWorkspaceRecord | null>;
  updateBillingSubscriptionState(
    input: UpdateBillingSubscriptionStateInput,
  ): Promise<BillingWorkspaceRecord>;
}
