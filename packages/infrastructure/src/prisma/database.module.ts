import { Module } from '@nestjs/common';
import { TRANSACTION_BOUNDARY } from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { PrismaPersistenceContext } from './prisma-persistence.context';
import { PrismaService } from './prisma.service';
import { PrismaTransactionBoundary, PrismaTransactionContext } from './transactions';

@Module({
  imports: [RunlaneConfigModule],
  providers: [
    PrismaService,
    PrismaTransactionContext,
    PrismaPersistenceContext,
    PrismaTransactionBoundary,
    {
      provide: TRANSACTION_BOUNDARY,
      useExisting: PrismaTransactionBoundary,
    },
  ],
  exports: [PrismaService, PrismaPersistenceContext, TRANSACTION_BOUNDARY],
})
export class RunlaneDatabaseModule {}
