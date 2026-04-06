import type { StripeWebhookResponseDto } from '@runlane/contracts';
import {
  type BillingEventRepositoryPort,
  type BillingWorkspaceRepositoryPort,
  type StripeWebhookVerifierPort,
} from '../../ports';
import {
  billingWorkspaceNotFound,
  isHandledStripeBillingEventType,
  type BillingEventStatus,
} from '@runlane/domain';
import { buildStripeWebhookResponse } from './billing-response';

export interface ProcessStripeWebhookUseCaseInput {
  readonly rawPayload: string;
  readonly signatureHeader: string;
  readonly receivedAt?: Date;
}

export class ProcessStripeWebhookUseCase {
  constructor(
    private readonly events: BillingEventRepositoryPort,
    private readonly workspaces: BillingWorkspaceRepositoryPort,
    private readonly verifier: StripeWebhookVerifierPort,
  ) {}

  async execute(input: ProcessStripeWebhookUseCaseInput): Promise<StripeWebhookResponseDto> {
    const receivedAt = input.receivedAt ?? new Date();
    const event = this.verifier.verify({
      rawPayload: input.rawPayload,
      signatureHeader: input.signatureHeader,
      receivedAt,
    });
    const existingEvent = await this.events.findByProviderEventId({
      provider: 'stripe',
      providerEventId: event.id,
    });

    if (existingEvent && existingEvent.status !== 'failed') {
      return buildStripeWebhookResponse({
        eventId: existingEvent.providerEventId,
        eventType: existingEvent.eventType,
        status: 'duplicate',
        workspaceId: existingEvent.workspaceId,
      });
    }

    const initialEvent =
      existingEvent ??
      (await this.events.create({
        workspaceId: null,
        provider: 'stripe',
        providerEventId: event.id,
        eventType: event.type,
        status: 'received',
        payload: event.payload,
        errorMessage: null,
        receivedAt,
      }));

    if (!isHandledStripeBillingEventType(event.type)) {
      const ignoredEvent = await this.events.updateStatus({
        id: initialEvent.id,
        workspaceId: null,
        status: 'ignored',
        errorMessage: null,
        processedAt: receivedAt,
      });

      return buildStripeWebhookResponse({
        eventId: ignoredEvent.providerEventId,
        eventType: ignoredEvent.eventType,
        status: 'ignored',
        workspaceId: ignoredEvent.workspaceId,
      });
    }

    if (!event.subscription) {
      const ignoredEvent = await this.events.updateStatus({
        id: initialEvent.id,
        workspaceId: null,
        status: 'ignored',
        errorMessage: 'Stripe event does not contain subscription state',
        processedAt: receivedAt,
      });

      return buildStripeWebhookResponse({
        eventId: ignoredEvent.providerEventId,
        eventType: ignoredEvent.eventType,
        status: 'ignored',
        workspaceId: ignoredEvent.workspaceId,
      });
    }

    const workspace =
      (event.subscription.stripeSubscriptionId
        ? await this.workspaces.findByStripeSubscriptionId(event.subscription.stripeSubscriptionId)
        : null) ??
      (await this.workspaces.findByStripeCustomerId(event.subscription.stripeCustomerId));

    if (!workspace) {
      const missingWorkspaceError = billingWorkspaceNotFound(event.subscription.stripeCustomerId);
      const failedStatus: BillingEventStatus = 'failed';

      await this.events.updateStatus({
        id: initialEvent.id,
        workspaceId: null,
        status: failedStatus,
        errorMessage: missingWorkspaceError.message,
        processedAt: receivedAt,
      });

      throw missingWorkspaceError;
    }

    const updatedWorkspace = await this.workspaces.updateBillingSubscriptionState({
      workspaceId: workspace.id,
      stripeCustomerId: event.subscription.stripeCustomerId,
      stripeSubscriptionId: event.subscription.stripeSubscriptionId,
      billingStatus: event.subscription.billingStatus,
      plan: event.subscription.plan,
      currentPeriodStart: event.subscription.currentPeriodStart,
      currentPeriodEnd: event.subscription.currentPeriodEnd,
    });
    const processedEvent = await this.events.updateStatus({
      id: initialEvent.id,
      workspaceId: updatedWorkspace.id,
      status: 'processed',
      errorMessage: null,
      processedAt: receivedAt,
    });

    return buildStripeWebhookResponse({
      eventId: processedEvent.providerEventId,
      eventType: processedEvent.eventType,
      status: 'processed',
      workspaceId: processedEvent.workspaceId,
    });
  }
}
