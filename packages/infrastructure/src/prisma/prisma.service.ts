import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(RuntimeConfigService) config: RuntimeConfigService) {
    super({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      errorFormat: 'minimal',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
