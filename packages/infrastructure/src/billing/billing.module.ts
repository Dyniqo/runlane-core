import { Module } from '@nestjs/common';
import {
  BILLING_EVENT_REPOSITORY,
  BILLING_WORKSPACE_REPOSITORY,
  CreateBillingCheckoutSessionUseCase,
  CreateBillingPortalSessionUseCase,
  ProcessStripeWebhookUseCase,
  STRIPE_BILLING_GATEWAY,
  STRIPE_WEBHOOK_VERIFIER,
  type BillingEventRepositoryPort,
  type BillingWorkspaceRepositoryPort,
  type StripeBillingGatewayPort,
  type StripeWebhookVerifierPort,
} from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaBillingEventRepository, PrismaBillingWorkspaceRepository } from './repositories';
import { StripeBillingGateway, StripeWebhookVerifier } from './stripe';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule],
  providers: [
    PrismaBillingEventRepository,
    PrismaBillingWorkspaceRepository,
    StripeBillingGateway,
    StripeWebhookVerifier,
    {
      provide: BILLING_EVENT_REPOSITORY,
      useExisting: PrismaBillingEventRepository,
    },
    {
      provide: BILLING_WORKSPACE_REPOSITORY,
      useExisting: PrismaBillingWorkspaceRepository,
    },
    {
      provide: STRIPE_BILLING_GATEWAY,
      useExisting: StripeBillingGateway,
    },
    {
      provide: STRIPE_WEBHOOK_VERIFIER,
      useExisting: StripeWebhookVerifier,
    },
    {
      provide: CreateBillingCheckoutSessionUseCase,
      inject: [BILLING_WORKSPACE_REPOSITORY, STRIPE_BILLING_GATEWAY],
      useFactory: (workspaces: BillingWorkspaceRepositoryPort, stripe: StripeBillingGatewayPort) =>
        new CreateBillingCheckoutSessionUseCase(workspaces, stripe),
    },
    {
      provide: CreateBillingPortalSessionUseCase,
      inject: [BILLING_WORKSPACE_REPOSITORY, STRIPE_BILLING_GATEWAY],
      useFactory: (workspaces: BillingWorkspaceRepositoryPort, stripe: StripeBillingGatewayPort) =>
        new CreateBillingPortalSessionUseCase(workspaces, stripe),
    },
    {
      provide: ProcessStripeWebhookUseCase,
      inject: [BILLING_EVENT_REPOSITORY, BILLING_WORKSPACE_REPOSITORY, STRIPE_WEBHOOK_VERIFIER],
      useFactory: (
        events: BillingEventRepositoryPort,
        workspaces: BillingWorkspaceRepositoryPort,
        verifier: StripeWebhookVerifierPort,
      ) => new ProcessStripeWebhookUseCase(events, workspaces, verifier),
    },
  ],
  exports: [
    BILLING_EVENT_REPOSITORY,
    BILLING_WORKSPACE_REPOSITORY,
    STRIPE_BILLING_GATEWAY,
    STRIPE_WEBHOOK_VERIFIER,
    CreateBillingCheckoutSessionUseCase,
    CreateBillingPortalSessionUseCase,
    ProcessStripeWebhookUseCase,
  ],
})
export class RunlaneBillingModule {}
