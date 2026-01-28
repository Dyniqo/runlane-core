import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneRedisModule } from '../redis';
import { RedisRateLimitMiddleware } from './middleware';

@Module({
  imports: [RunlaneConfigModule, RunlaneRedisModule],
  providers: [RedisRateLimitMiddleware],
})
export class RunlaneSecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RedisRateLimitMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
