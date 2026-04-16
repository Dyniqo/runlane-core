import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CreateBillingCheckoutSessionUseCase,
  CreateBillingPortalSessionUseCase,
  ProcessStripeWebhookUseCase,
} from '@runlane/application';
import type {
  BillingCheckoutResponseDto,
  BillingPortalResponseDto,
  StripeWebhookResponseDto,
} from '@runlane/contracts';
import { DomainError } from '@runlane/domain';
import {
  readWorkspaceScope,
  WorkspaceTenantGuard,
  type WorkspaceScopedHttpRequest,
} from '@runlane/infrastructure';

type OpenApiSchemaObject = {
  readonly type?: string;
  readonly format?: string;
  readonly example?: unknown;
  readonly required?: string[];
  readonly enum?: unknown[];
  readonly properties?: Record<string, OpenApiSchemaObject>;
  readonly nullable?: boolean;
};

interface RawBodyHttpRequest {
  readonly rawBody?: Buffer;
  readonly body?: unknown;
}

const billingCheckoutRequestSchema = {
  type: 'object',
  required: ['plan'],
  properties: {
    plan: { type: 'string', enum: ['starter', 'pro', 'agency'], example: 'pro' },
  },
} satisfies OpenApiSchemaObject;

const billingCheckoutResponseSchema = {
  type: 'object',
  required: ['provider', 'workspaceId', 'plan', 'stripeCustomerId', 'sessionId', 'url'],
  properties: {
    provider: { type: 'string', enum: ['stripe'] },
    workspaceId: { type: 'string', format: 'uuid' },
    plan: { type: 'string', enum: ['starter', 'pro', 'agency'] },
    stripeCustomerId: { type: 'string', example: 'cus_123' },
    sessionId: { type: 'string', example: 'cs_test_123' },
    url: { type: 'string', format: 'uri' },
  },
} satisfies OpenApiSchemaObject;

const billingPortalResponseSchema = {
  type: 'object',
  required: ['provider', 'workspaceId', 'stripeCustomerId', 'sessionId', 'url'],
  properties: {
    provider: { type: 'string', enum: ['stripe'] },
    workspaceId: { type: 'string', format: 'uuid' },
    stripeCustomerId: { type: 'string', example: 'cus_123' },
    sessionId: { type: 'string', example: 'bps_123' },
    url: { type: 'string', format: 'uri' },
  },
} satisfies OpenApiSchemaObject;

const stripeWebhookResponseSchema = {
  type: 'object',
  required: ['received', 'eventId', 'eventType', 'status', 'workspaceId'],
  properties: {
    received: { type: 'boolean', example: true },
    eventId: { type: 'string', example: 'evt_123' },
    eventType: { type: 'string', example: 'customer.subscription.updated' },
    status: { type: 'string', enum: ['processed', 'ignored', 'duplicate'] },
    workspaceId: { type: 'string', format: 'uuid', nullable: true },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Billing')
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(
    @Inject(CreateBillingCheckoutSessionUseCase)
    private readonly createCheckoutSession: CreateBillingCheckoutSessionUseCase,
    @Inject(CreateBillingPortalSessionUseCase)
    private readonly createPortalSession: CreateBillingPortalSessionUseCase,
    @Inject(ProcessStripeWebhookUseCase)
    private readonly processStripeWebhook: ProcessStripeWebhookUseCase,
  ) {}

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(WorkspaceTenantGuard)
  @ApiOperation({
    operationId: 'createBillingCheckout',
    summary: 'Create a Stripe checkout session',
  })
  @ApiBody({ schema: billingCheckoutRequestSchema })
  @ApiCreatedResponse({ schema: billingCheckoutResponseSchema })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Workspace owner access is required' })
  @ApiBadRequestResponse({ description: 'Checkout payload is invalid' })
  checkout(
    @Req() request: WorkspaceScopedHttpRequest,
    @Body() body: unknown,
  ): Promise<BillingCheckoutResponseDto> {
    const payload = parseBillingCheckoutRequest(body);

    return this.createCheckoutSession.execute({
      scope: readWorkspaceScope(request),
      plan: payload.plan,
    });
  }

  @Post('portal')
  @ApiBearerAuth()
  @UseGuards(WorkspaceTenantGuard)
  @ApiOperation({
    operationId: 'createBillingPortal',
    summary: 'Create a Stripe customer portal session',
  })
  @ApiCreatedResponse({ schema: billingPortalResponseSchema })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Workspace owner access is required' })
  portal(@Req() request: WorkspaceScopedHttpRequest): Promise<BillingPortalResponseDto> {
    return this.createPortalSession.execute({ scope: readWorkspaceScope(request) });
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'receiveStripeWebhook',
    summary: 'Receive a Stripe billing webhook',
  })
  @ApiHeader({ name: 'Stripe-Signature', required: true })
  @ApiOkResponse({ schema: stripeWebhookResponseSchema })
  @ApiBadRequestResponse({ description: 'Webhook payload is invalid' })
  @ApiUnauthorizedResponse({ description: 'Stripe signature is invalid' })
  receiveStripeWebhook(
    @Req() request: RawBodyHttpRequest,
    @Headers('stripe-signature') stripeSignature: string | undefined,
  ): Promise<StripeWebhookResponseDto> {
    const rawPayload = readRawPayload(request);

    return this.processStripeWebhook.execute({
      rawPayload,
      signatureHeader: stripeSignature ?? '',
    });
  }
}

interface ParsedBillingCheckoutRequest {
  readonly plan: string;
}

function parseBillingCheckoutRequest(body: unknown): ParsedBillingCheckoutRequest {
  if (!isRecord(body)) {
    throw invalidBillingPayload('Billing checkout payload must be an object');
  }

  if (typeof body.plan !== 'string') {
    throw invalidBillingPayload('Billing checkout plan is required');
  }

  return { plan: body.plan };
}

function readRawPayload(request: RawBodyHttpRequest): string {
  if (request.rawBody && request.rawBody.byteLength > 0) {
    return request.rawBody.toString('utf8');
  }

  if (typeof request.body === 'object' && request.body !== null) {
    return JSON.stringify(request.body);
  }

  throw new DomainError({
    code: 'BILLING_WEBHOOK_RAW_BODY_MISSING',
    category: 'validation',
    message: 'Billing webhook raw body is missing',
  });
}

function invalidBillingPayload(message: string): DomainError {
  return new DomainError({
    code: 'BILLING_PAYLOAD_INVALID',
    category: 'validation',
    message,
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
