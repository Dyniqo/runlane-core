import { Module } from '@nestjs/common';
import {
  BILLING_EVENT_REPOSITORY,
  BILLING_WORKSPACE_REPOSITORY,
  ProcessStripeWebhookUseCase,
  STRIPE_WEBHOOK_VERIFIER,
  type BillingEventRepositoryPort,
  type BillingWorkspaceRepositoryPort,
  type StripeWebhookVerifierPort,
} from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneDatabaseModule } from '../prisma';
import { PrismaBillingEventRepository, PrismaBillingWorkspaceRepository } from './repositories';
import { StripeWebhookVerifier } from './stripe';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule],
  providers: [
    PrismaBillingEventRepository,
    PrismaBillingWorkspaceRepository,
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
      provide: STRIPE_WEBHOOK_VERIFIER,
      useExisting: StripeWebhookVerifier,
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
    STRIPE_WEBHOOK_VERIFIER,
    ProcessStripeWebhookUseCase,
  ],
})
export class RunlaneBillingModule {}
