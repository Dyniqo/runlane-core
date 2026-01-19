import { Controller, Get } from '@nestjs/common';
import { RUNLANE_API_VERSION, RUNLANE_PRODUCT_NAME } from '@runlane/contracts';
import type { RunlaneServiceDescriptor } from '@runlane/contracts';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller({ version: RUNLANE_API_VERSION })
export class ApiController {
  @Get()
  @ApiOperation({ operationId: 'getApiDescriptor', summary: 'Get API descriptor' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['product', 'service'],
      properties: {
        product: { type: 'string', example: RUNLANE_PRODUCT_NAME },
        service: { type: 'string', enum: ['api'] },
      },
    },
  })
  getService(): RunlaneServiceDescriptor {
    return {
      product: RUNLANE_PRODUCT_NAME,
      service: 'api',
    };
  }
}
