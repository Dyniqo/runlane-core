import type { BillingCheckoutResponseDto } from '@runlane/contracts';
import {
  assertBillingCheckoutPlan,
  assertWorkspaceRole,
  billingWorkspaceIdNotFound,
} from '@runlane/domain';
import type {
  BillingWorkspaceRepositoryPort,
  StripeBillingGatewayPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildBillingCheckoutResponse } from './billing-response';

export interface CreateBillingCheckoutSessionUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly plan: string;
}

export class CreateBillingCheckoutSessionUseCase implements UseCase<
  CreateBillingCheckoutSessionUseCaseInput,
  BillingCheckoutResponseDto
> {
  constructor(
    private readonly workspaces: BillingWorkspaceRepositoryPort,
    private readonly stripe: StripeBillingGatewayPort,
  ) {}

  async execute(
    input: CreateBillingCheckoutSessionUseCaseInput,
  ): Promise<BillingCheckoutResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const plan = assertBillingCheckoutPlan(input.plan);
    this.stripe.assertCheckoutSessionConfigured(plan);
    const workspace = await this.workspaces.findByWorkspaceId(input.scope.workspaceId);

    if (!workspace) {
      throw billingWorkspaceIdNotFound(input.scope.workspaceId);
    }

    let stripeCustomerId = workspace.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await this.stripe.createCustomer({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      });
      const updatedWorkspace = await this.workspaces.updateStripeCustomerId({
        workspaceId: workspace.id,
        stripeCustomerId: customer.id,
      });
      stripeCustomerId = updatedWorkspace.stripeCustomerId;
    }

    if (!stripeCustomerId) {
      throw billingWorkspaceIdNotFound(workspace.id);
    }

    const session = await this.stripe.createCheckoutSession({
      workspaceId: workspace.id,
      userId: input.scope.userId,
      stripeCustomerId,
      plan,
    });

    return buildBillingCheckoutResponse({
      workspaceId: workspace.id,
      plan,
      stripeCustomerId,
      sessionId: session.id,
      url: session.url,
    });
  }
}
