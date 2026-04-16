import { Module } from '@nestjs/common';
import { RunlaneBillingModule, RunlaneIdentityModule } from '@runlane/infrastructure';
import { BillingController } from './billing.controller';

@Module({
  imports: [RunlaneIdentityModule, RunlaneBillingModule],
  controllers: [BillingController],
})
export class BillingModule {}
