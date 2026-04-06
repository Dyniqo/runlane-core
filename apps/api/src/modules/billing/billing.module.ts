import { Module } from '@nestjs/common';
import { RunlaneBillingModule } from '@runlane/infrastructure';
import { BillingController } from './billing.controller';

@Module({
  imports: [RunlaneBillingModule],
  controllers: [BillingController],
})
export class BillingModule {}
