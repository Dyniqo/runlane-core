import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneBullMqModule } from '../bullmq';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneRedisModule } from '../redis';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule, RunlaneRedisModule, RunlaneBullMqModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class RunlaneHealthModule {}
