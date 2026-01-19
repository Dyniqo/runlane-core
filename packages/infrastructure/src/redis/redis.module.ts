import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RedisService } from './redis.service';

@Module({
  imports: [RunlaneConfigModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RunlaneRedisModule {}
