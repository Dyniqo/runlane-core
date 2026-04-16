import { Inject, Injectable } from '@nestjs/common';
import type {
  BillingWorkspaceRecord,
  BillingWorkspaceRepositoryPort,
  UpdateBillingStripeCustomerInput,
  UpdateBillingSubscriptionStateInput,
} from '@runlane/application';
import { normalizeBillingStatus, normalizeWorkspacePlan } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaBillingWorkspaceRepository implements BillingWorkspaceRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async findByWorkspaceId(workspaceId: string): Promise<BillingWorkspaceRecord | null> {
    const workspace = await this.persistence.client.workspace.findUnique({
      where: { id: workspaceId },
      select: workspaceBillingSelect,
    });

    return workspace ? mapBillingWorkspace(workspace) : null;
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<BillingWorkspaceRecord | null> {
    const workspace = await this.persistence.client.workspace.findFirst({
      where: { stripeCustomerId },
      select: workspaceBillingSelect,
    });

    return workspace ? mapBillingWorkspace(workspace) : null;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<BillingWorkspaceRecord | null> {
    const workspace = await this.persistence.client.workspace.findFirst({
      where: { stripeSubscriptionId },
      select: workspaceBillingSelect,
    });

    return workspace ? mapBillingWorkspace(workspace) : null;
  }

  async updateStripeCustomerId(
    input: UpdateBillingStripeCustomerInput,
  ): Promise<BillingWorkspaceRecord> {
    const workspace = await this.persistence.client.workspace.update({
      where: { id: input.workspaceId },
      data: { stripeCustomerId: input.stripeCustomerId },
      select: workspaceBillingSelect,
    });

    return mapBillingWorkspace(workspace);
  }

  async updateBillingSubscriptionState(
    input: UpdateBillingSubscriptionStateInput,
  ): Promise<BillingWorkspaceRecord> {
    const workspace = await this.persistence.client.workspace.update({
      where: { id: input.workspaceId },
      data: {
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        billingStatus: mapBillingStatusToPrisma(input.billingStatus),
        billingCurrentPeriodStart: input.currentPeriodStart,
        billingCurrentPeriodEnd: input.currentPeriodEnd,
        ...(input.plan ? { plan: mapWorkspacePlanToPrisma(input.plan) } : {}),
      },
      select: workspaceBillingSelect,
    });

    return mapBillingWorkspace(workspace);
  }
}

const workspaceBillingSelect = {
  id: true,
  name: true,
  plan: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  billingStatus: true,
} as const;

interface PrismaBillingWorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly plan: string;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly billingStatus: string;
}

function mapBillingWorkspace(workspace: PrismaBillingWorkspaceRecord): BillingWorkspaceRecord {
  return {
    id: workspace.id,
    name: workspace.name,
    plan: normalizeWorkspacePlan(workspace.plan),
    stripeCustomerId: workspace.stripeCustomerId,
    stripeSubscriptionId: workspace.stripeSubscriptionId,
    billingStatus: normalizeBillingStatus(workspace.billingStatus),
  };
}

type PrismaBillingStatus =
  | 'NONE'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'PAUSED';
type PrismaWorkspacePlan = 'FREE' | 'STARTER' | 'PRO' | 'AGENCY';

function mapBillingStatusToPrisma(status: string): PrismaBillingStatus {
  if (status === 'trialing') {
    return 'TRIALING';
  }

  if (status === 'active') {
    return 'ACTIVE';
  }

  if (status === 'past_due') {
    return 'PAST_DUE';
  }

  if (status === 'canceled') {
    return 'CANCELED';
  }

  if (status === 'unpaid') {
    return 'UNPAID';
  }

  if (status === 'incomplete') {
    return 'INCOMPLETE';
  }

  if (status === 'incomplete_expired') {
    return 'INCOMPLETE_EXPIRED';
  }

  if (status === 'paused') {
    return 'PAUSED';
  }

  return 'NONE';
}

function mapWorkspacePlanToPrisma(plan: string): PrismaWorkspacePlan {
  if (plan === 'starter') {
    return 'STARTER';
  }

  if (plan === 'pro') {
    return 'PRO';
  }

  if (plan === 'agency') {
    return 'AGENCY';
  }

  return 'FREE';
}
