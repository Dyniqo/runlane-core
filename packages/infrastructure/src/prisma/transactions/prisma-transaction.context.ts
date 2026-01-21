import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { PrismaTransactionClient } from '../prisma-persistence.context';

@Injectable()
export class PrismaTransactionContext {
  private readonly storage = new AsyncLocalStorage<PrismaTransactionClient>();

  get current(): PrismaTransactionClient | undefined {
    return this.storage.getStore();
  }

  get isActive(): boolean {
    return this.current !== undefined;
  }

  run<Result>(client: PrismaTransactionClient, operation: () => Promise<Result>): Promise<Result> {
    return this.storage.run(client, operation);
  }
}
