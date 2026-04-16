import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateStripeCheckoutSessionInput,
  CreateStripeCustomerInput,
  CreateStripePortalSessionInput,
  StripeBillingGatewayPort,
  StripeCheckoutSessionRecord,
  StripeCustomerRecord,
  StripePortalSessionRecord,
} from '@runlane/application';
import { RuntimeConfigService } from '@runlane/config';
import type { JsonObject } from '@runlane/contracts';
import {
  billingStripeApiKeyMissing,
  billingStripePriceMissing,
  billingStripeRequestFailed,
  billingStripeSessionInvalid,
  type BillingCheckoutPlan,
} from '@runlane/domain';

const STRIPE_API_VERSION = '2024-06-20';

interface StripeHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

@Injectable()
export class StripeBillingGateway implements StripeBillingGatewayPort {
  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}

  assertCheckoutSessionConfigured(plan: BillingCheckoutPlan): void {
    this.resolveApiKey();
    this.resolvePriceId(plan);
  }

  async createCustomer(input: CreateStripeCustomerInput): Promise<StripeCustomerRecord> {
    const response = await this.requestStripe('customers', {
      name: input.workspaceName,
      'metadata[runlane_workspace_id]': input.workspaceId,
      'metadata[runlane_source]': 'runlane_core',
    });
    const id = readStripeObjectId(response, 'Stripe customer id');

    return { id };
  }

  async createCheckoutSession(
    input: CreateStripeCheckoutSessionInput,
  ): Promise<StripeCheckoutSessionRecord> {
    const priceId = this.resolvePriceId(input.plan);
    const response = await this.requestStripe('checkout/sessions', {
      mode: 'subscription',
      customer: input.stripeCustomerId,
      client_reference_id: input.workspaceId,
      success_url: this.config.stripeCheckoutSuccessUrl,
      cancel_url: this.config.stripeCheckoutCancelUrl,
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'metadata[runlane_workspace_id]': input.workspaceId,
      'metadata[runlane_user_id]': input.userId,
      'metadata[runlane_plan]': input.plan,
      'subscription_data[metadata][runlane_workspace_id]': input.workspaceId,
      'subscription_data[metadata][runlane_plan]': input.plan,
    });

    return readSession(response, 'Stripe checkout session');
  }

  async createPortalSession(
    input: CreateStripePortalSessionInput,
  ): Promise<StripePortalSessionRecord> {
    const response = await this.requestStripe('billing_portal/sessions', {
      customer: input.stripeCustomerId,
      return_url: this.config.stripePortalReturnUrl,
    });

    return readSession(response, 'Stripe billing portal session');
  }

  private resolveApiKey(): string {
    const apiKey = this.config.stripeApiKey;

    if (!apiKey) {
      throw billingStripeApiKeyMissing();
    }

    return apiKey;
  }

  private resolvePriceId(plan: BillingCheckoutPlan): string {
    if (plan === 'starter' && this.config.stripePriceStarterId) {
      return this.config.stripePriceStarterId;
    }

    if (plan === 'pro' && this.config.stripePriceProId) {
      return this.config.stripePriceProId;
    }

    if (plan === 'agency' && this.config.stripePriceAgencyId) {
      return this.config.stripePriceAgencyId;
    }

    throw billingStripePriceMissing(plan);
  }

  private async requestStripe(
    path: string,
    parameters: Readonly<Record<string, string>>,
  ): Promise<JsonObject> {
    const response = await sendStripeRequest({
      apiKey: this.resolveApiKey(),
      baseUrl: this.config.stripeApiBaseUrl,
      operation: path,
      parameters,
      timeoutMs: this.config.stripeRequestTimeoutMs,
    });
    const body = await readStripeResponse(response);

    if (!response.ok) {
      throw billingStripeRequestFailed({
        operation: path,
        statusCode: response.status,
        message:
          readStripeErrorMessage(body) ?? `Stripe request failed with status ${response.status}`,
      });
    }

    return body;
  }
}

interface SendStripeRequestInput {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly operation: string;
  readonly parameters: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

async function sendStripeRequest(input: SendStripeRequestInput): Promise<StripeHttpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await fetch(`${input.baseUrl.replace(/\/+$/u, '')}/${input.operation}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_API_VERSION,
      },
      body: new URLSearchParams(input.parameters).toString(),
      signal: controller.signal,
    });
  } catch (error) {
    throw billingStripeRequestFailed({
      operation: input.operation,
      statusCode: 0,
      message: readStripeNetworkErrorMessage(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readStripeResponse(response: StripeHttpResponse): Promise<JsonObject> {
  const text = await response.text();

  if (!text) {
    throw billingStripeSessionInvalid('Stripe response body is empty');
  }

  try {
    const parsed: unknown = JSON.parse(text);

    if (isJsonObject(parsed)) {
      return parsed;
    }
  } catch {
    throw billingStripeSessionInvalid('Stripe response body must be valid JSON');
  }

  throw billingStripeSessionInvalid('Stripe response body must be a JSON object');
}

function readStripeObjectId(response: JsonObject, name: string): string {
  const id = response.id;

  if (typeof id !== 'string' || id.length === 0 || id.length > 255) {
    throw billingStripeSessionInvalid(`${name} is missing`);
  }

  return id;
}

function readSession(response: JsonObject, name: string): StripeCheckoutSessionRecord {
  const id = readStripeObjectId(response, `${name} id`);
  const url = response.url;

  if (typeof url !== 'string' || !/^https:\/\//u.test(url)) {
    throw billingStripeSessionInvalid(`${name} URL is missing`);
  }

  return { id, url };
}

function readStripeErrorMessage(response: JsonObject): string | null {
  const error = response.error;

  if (isJsonObject(error) && typeof error.message === 'string') {
    return error.message;
  }

  return null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStripeNetworkErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    String(error.name) === 'AbortError'
  ) {
    return 'Stripe request timed out';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Stripe request failed';
}
