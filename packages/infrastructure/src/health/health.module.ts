import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RunlaneDatabaseModule } from '../prisma';
import { RunlaneRedisModule } from '../redis';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule, RunlaneRedisModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class RunlaneHealthModule {}
