import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { PrismaService } from './prisma.service';

@Module({
  imports: [RunlaneConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class RunlaneDatabaseModule {}
