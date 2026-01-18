import { Module } from '@nestjs/common';
import { RunlaneConfigModule } from '@runlane/config';
import { ApiController } from './api.controller';

@Module({
  imports: [RunlaneConfigModule],
  controllers: [ApiController],
})
export class ApiModule {}
