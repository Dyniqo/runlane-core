import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ReceivePublicWebhookUseCase } from '@runlane/application';
import type { PublicWebhookResponseDto } from '@runlane/contracts';

type OpenApiSchema<T = Parameters<typeof ApiBody>[0]> = T extends { schema: infer Schema }
  ? Schema
  : never;

const webhookPayloadSchema: OpenApiSchema = {
  type: 'object',
  additionalProperties: true,
  example: {
    leadId: 'lead_1029',
    email: 'ada@example.com',
    company: 'Analytical Engines',
    source: 'website_form',
  },
};

const publicWebhookResponseSchema: OpenApiSchema = {
  type: 'object',
  required: ['webhookRequest'],
  properties: {
    webhookRequest: {
      type: 'object',
      required: [
        'id',
        'workspaceId',
        'workflowId',
        'workflowPublicId',
        'workflowVersion',
        'status',
        'source',
        'idempotencyKey',
        'payloadHash',
        'receivedAt',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        workspaceId: { type: 'string', format: 'uuid' },
        workflowId: { type: 'string', format: 'uuid' },
        workflowPublicId: { type: 'string', example: 'wf_0123456789abcdef0123456789abcdef' },
        workflowVersion: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: ['accepted', 'rejected'] },
        source: { type: 'string', example: 'website_form' },
        idempotencyKey: { type: 'string', nullable: true, example: 'lead-1029' },
        payloadHash: { type: 'string', example: 'f'.repeat(64) },
        receivedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

@ApiTags('Public Webhooks')
@Controller({ path: 'hooks', version: '1' })
export class HooksController {
  constructor(
    @Inject(ReceivePublicWebhookUseCase)
    private readonly receivePublicWebhook: ReceivePublicWebhookUseCase,
  ) {}

  @Post(':workflowPublicId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    operationId: 'receivePublicWebhook',
    summary: 'Receive a signed public webhook payload for a published workflow',
  })
  @ApiParam({
    name: 'workflowPublicId',
    schema: { type: 'string', example: 'wf_0123456789abcdef0123456789abcdef' },
  })
  @ApiHeader({
    name: 'X-Runlane-Source',
    required: false,
    schema: { type: 'string', example: 'website_form' },
  })
  @ApiHeader({
    name: 'X-Runlane-Idempotency-Key',
    required: false,
    schema: { type: 'string', example: 'lead-1029' },
  })
  @ApiHeader({
    name: 'X-Runlane-Signature',
    required: true,
    schema: {
      type: 'string',
      example: 't=1760000000,v1=2d7b5fb7f3d5e8d5dd276f4d5ef4c04c7d8dbfc225d0b7ec30ff4c95d6c19d9d',
    },
  })
  @ApiBody({ schema: webhookPayloadSchema })
  @ApiAcceptedResponse({ schema: publicWebhookResponseSchema })
  @ApiUnauthorizedResponse({ description: 'Webhook signature is missing, expired or invalid' })
  @ApiNotFoundResponse({
    description: 'Workflow public id does not resolve to a published workflow',
  })
  @ApiConflictResponse({
    description:
      'Workflow trigger, replay protection or idempotency validation rejected the request',
  })
  receive(
    @Req() request: PublicWebhookHttpRequest,
    @Param('workflowPublicId') workflowPublicId: string,
    @Body() body: unknown,
  ): Promise<PublicWebhookResponseDto> {
    return this.receivePublicWebhook.execute({
      workflowPublicId,
      payload: body,
      signature: readHeader(request, 'x-runlane-signature', 512),
      idempotencyKey: readHeader(request, 'x-runlane-idempotency-key', 160),
      source: readHeader(request, 'x-runlane-source', 80),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }
}

type PublicWebhookHttpRequest = {
  readonly headers: Record<string, string | readonly string[] | undefined>;
  readonly ip?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
};

function readHeader(
  request: PublicWebhookHttpRequest,
  name: string,
  maximumLength: number,
): string | null {
  const value = request.headers[name];
  const headerValue = Array.isArray(value) ? value[0] : value;

  if (!headerValue) {
    return null;
  }

  return headerValue.slice(0, maximumLength);
}

function readClientIp(request: PublicWebhookHttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}
