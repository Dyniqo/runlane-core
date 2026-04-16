import type { BillingStatus, BillingSubscriptionState } from '@runlane/domain';
import type { WorkspacePlan } from '@runlane/domain';

export const BILLING_WORKSPACE_REPOSITORY = Symbol('BILLING_WORKSPACE_REPOSITORY');

export interface BillingWorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly plan: WorkspacePlan;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly billingStatus: BillingStatus;
}

export interface UpdateBillingSubscriptionStateInput extends BillingSubscriptionState {
  readonly workspaceId: string;
}

export interface UpdateBillingStripeCustomerInput {
  readonly workspaceId: string;
  readonly stripeCustomerId: string;
}

export interface BillingWorkspaceRepositoryPort {
  findByWorkspaceId(workspaceId: string): Promise<BillingWorkspaceRecord | null>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<BillingWorkspaceRecord | null>;
  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<BillingWorkspaceRecord | null>;
  updateStripeCustomerId(input: UpdateBillingStripeCustomerInput): Promise<BillingWorkspaceRecord>;
  updateBillingSubscriptionState(
    input: UpdateBillingSubscriptionStateInput,
  ): Promise<BillingWorkspaceRecord>;
}
