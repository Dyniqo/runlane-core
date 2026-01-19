import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import { createClient } from 'redis';
import { StructuredLoggerService } from '../observability';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client;

  constructor(
    @Inject(RuntimeConfigService) config: RuntimeConfigService,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
  ) {
    this.client = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: config.redisConnectTimeoutMs,
        reconnectStrategy: (retries) => {
          if (retries >= 10) {
            return new Error('Redis reconnect attempts exhausted');
          }

          return Math.min(100 * 2 ** retries, 3000);
        },
      },
    });

    this.client.on('error', (error) => {
      this.logger.logEvent('error', 'Redis client error', { error }, RedisService.name);
    });

    this.client.on('reconnecting', () => {
      this.logger.logEvent('warn', 'Redis client reconnecting', {}, RedisService.name);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.logEvent('info', 'Redis connection established', {}, RedisService.name);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }

  async ping(): Promise<void> {
    const response = await this.client.ping();

    if (response !== 'PONG') {
      throw new Error('Redis ping returned an unexpected response');
    }
  }
}
