import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaTransactionContext } from './transactions/prisma-transaction.context';

export type PrismaTransactionClient = Omit<
  PrismaService,
  | '$connect'
  | '$disconnect'
  | '$on'
  | '$transaction'
  | '$use'
  | '$extends'
  | 'onModuleInit'
  | 'onModuleDestroy'
  | 'ping'
>;

export type PrismaPersistenceClient = PrismaTransactionClient;

@Injectable()
export class PrismaPersistenceContext {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrismaTransactionContext) private readonly transactionContext: PrismaTransactionContext,
  ) {}

  get client(): PrismaPersistenceClient {
    return (this.transactionContext.current ?? this.prisma) as PrismaPersistenceClient;
  }

  get isTransactionActive(): boolean {
    return this.transactionContext.isActive;
  }
}
