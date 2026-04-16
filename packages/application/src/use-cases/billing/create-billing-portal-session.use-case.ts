import type { BillingPortalResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  billingStripeCustomerMissing,
  billingWorkspaceIdNotFound,
} from '@runlane/domain';
import type {
  BillingWorkspaceRepositoryPort,
  StripeBillingGatewayPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildBillingPortalResponse } from './billing-response';

export interface CreateBillingPortalSessionUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
}

export class CreateBillingPortalSessionUseCase implements UseCase<
  CreateBillingPortalSessionUseCaseInput,
  BillingPortalResponseDto
> {
  constructor(
    private readonly workspaces: BillingWorkspaceRepositoryPort,
    private readonly stripe: StripeBillingGatewayPort,
  ) {}

  async execute(input: CreateBillingPortalSessionUseCaseInput): Promise<BillingPortalResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const workspace = await this.workspaces.findByWorkspaceId(input.scope.workspaceId);

    if (!workspace) {
      throw billingWorkspaceIdNotFound(input.scope.workspaceId);
    }

    if (!workspace.stripeCustomerId) {
      throw billingStripeCustomerMissing(workspace.id);
    }

    const session = await this.stripe.createPortalSession({
      workspaceId: workspace.id,
      stripeCustomerId: workspace.stripeCustomerId,
    });

    return buildBillingPortalResponse({
      workspaceId: workspace.id,
      stripeCustomerId: workspace.stripeCustomerId,
      sessionId: session.id,
      url: session.url,
    });
  }
}
