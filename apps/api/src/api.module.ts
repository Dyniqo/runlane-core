import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { RunlaneDatabaseModule } from '@runlane/infrastructure';
import { ApiController } from './api.controller';

@Module({
  imports: [RunlaneConfigModule, RunlaneDatabaseModule],
  controllers: [ApiController],
})
export class ApiModule {}
