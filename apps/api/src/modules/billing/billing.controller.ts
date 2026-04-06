import { Controller, Headers, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ProcessStripeWebhookUseCase } from '@runlane/application';
import type { StripeWebhookResponseDto } from '@runlane/contracts';
import { DomainError } from '@runlane/domain';

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
    @Inject(ProcessStripeWebhookUseCase)
    private readonly processStripeWebhook: ProcessStripeWebhookUseCase,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive a Stripe billing webhook' })
  @ApiHeader({ name: 'Stripe-Signature', required: true })
  @ApiOkResponse({ schema: stripeWebhookResponseSchema })
  @ApiBadRequestResponse({ description: 'Webhook payload is invalid' })
  @ApiUnauthorizedResponse({ description: 'Stripe signature is invalid' })
  async receiveStripeWebhook(
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
