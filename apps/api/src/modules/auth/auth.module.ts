import { Module } from '@nestjs/common';
import { RunlaneIdentityModule } from '@runlane/infrastructure';
import { AuthController } from './auth.controller';

@Module({
  imports: [RunlaneIdentityModule],
  controllers: [AuthController],
})
export class AuthModule {}
