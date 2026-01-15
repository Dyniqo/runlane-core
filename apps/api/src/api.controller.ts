import { Controller, Get } from '@nestjs/common';
import { RUNLANE_PRODUCT_NAME } from '@runlane/contracts';
import type { RunlaneServiceDescriptor } from '@runlane/contracts';

@Controller()
export class ApiController {
  @Get()
  getService(): RunlaneServiceDescriptor {
    return {
      product: RUNLANE_PRODUCT_NAME,
      service: 'api',
    };
  }
}
