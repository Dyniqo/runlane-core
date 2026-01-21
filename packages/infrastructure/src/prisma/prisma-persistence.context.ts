import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { PrismaTransactionContext } from './transactions/prisma-transaction.context';

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export type PrismaPersistenceClient = PrismaService | PrismaTransactionClient;

@Injectable()
export class PrismaPersistenceContext {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrismaTransactionContext) private readonly transactionContext: PrismaTransactionContext,
  ) {}

  get client(): PrismaPersistenceClient {
    return this.transactionContext.current ?? this.prisma;
  }

  get isTransactionActive(): boolean {
    return this.transactionContext.isActive;
  }
}
